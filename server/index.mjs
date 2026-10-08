// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { GeminiRefineService, STYLE_PRESETS } from './services/gemini.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, '..');
const distPath = path.join(pluginRoot, 'dist');

const SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SEND_TO_CHAT_FILENAME_REGEX = /^[a-zA-Z0-9_\-]+\.(png|jpg|jpeg|webp)$/i;
const ALLOWED_ARTIFACT_EXTENSIONS = new Set([
  '.psd',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.gif',
]);
const MAX_JSON_BODY_BYTES = 50 * 1024 * 1024; // 50MB
const AGENTAPI_TIMEOUT_MS = 15_000; // 15 seconds

let activeServerPort = null;

function createHttpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Determine Antigravity app data directory portably with fail-fast validation
export function getAppDataDir() {
  if (process.env.ANTIGRAVITY_APP_DATA_DIR) {
    const envDir = process.env.ANTIGRAVITY_APP_DATA_DIR.trim();
    if (!fs.existsSync(envDir)) {
      throw createHttpError(
        `Configured ANTIGRAVITY_APP_DATA_DIR does not exist: "${envDir}"`,
        500
      );
    }
    return path.resolve(envDir);
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, '.gemini', 'antigravity'),
    path.join(home, 'Library', 'Application Support', 'Antigravity'),
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Antigravity'),
    path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'Antigravity'),
    path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Antigravity'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const geminiRoot = path.join(home, '.gemini');
  if (fs.existsSync(geminiRoot)) {
    const entries = fs.readdirSync(geminiRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidateDir = path.join(geminiRoot, entry.name);
        if (fs.existsSync(path.join(candidateDir, 'brain'))) {
          return candidateDir;
        }
      }
    }
  }

  throw createHttpError(
    `Antigravity app data directory not found. Set ANTIGRAVITY_APP_DATA_DIR to a valid directory.`,
    500
  );
}

export function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_REGEX.test(sessionId)) {
    throw createHttpError(
      `Invalid or missing session_id: "${sessionId}". Must match ${SESSION_ID_REGEX}.`,
      400
    );
  }
  return sessionId;
}

// Resolve session brain directory with strict existence check (fail-fast 404 for unknown sessions)
export function resolveSessionBrainDir(sessionId) {
  validateSessionId(sessionId);
  const appDataDir = getAppDataDir();
  const brainDir = path.join(appDataDir, 'brain');
  const sessionDir = path.join(brainDir, sessionId);

  if (sessionId === 'standalone') {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  if (!fs.existsSync(sessionDir) || !fs.statSync(sessionDir).isDirectory()) {
    throw createHttpError(
      `Session brain directory not found for session_id "${sessionId}" at "${sessionDir}".`,
      404
    );
  }

  return sessionDir;
}

// Discover recent Antigravity session IDs from brain directories
function getRecentSessions() {
  const appData = getAppDataDir();
  const brainDir = path.join(appData, 'brain');
  if (!fs.existsSync(brainDir)) {
    return [];
  }

  const entries = fs.readdirSync(brainDir, { withFileTypes: true });
  const list = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'tempmediaStorage') {
      continue;
    }
    const id = entry.name;
    if (!SESSION_ID_REGEX.test(id)) {
      continue;
    }
    const sessionPath = path.join(brainDir, id);
    const transcriptPath = path.join(sessionPath, '.system_generated', 'logs', 'transcript.jsonl');
    const targetPath = fs.existsSync(transcriptPath) ? transcriptPath : sessionPath;
    const stat = fs.statSync(targetPath);
    list.push({
      id,
      title: `Session ${id.slice(0, 8)}`,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      mtimeMs: stat.mtimeMs,
    });
  }

  list.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return list.slice(0, 20).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

// Discover latest active Antigravity session ID from brain directories
function getActiveSessionId() {
  const recent = getRecentSessions();
  return recent.length > 0 ? recent[0].id : null;
}

// Render dynamic canvas template injecting runtime PORT, HOST, and validated SESSION_ID
export function renderCanvasTemplate({ port, host = '127.0.0.1', sessionId } = {}) {
  const config = getConfig();
  const actualPort = port ?? activeServerPort ?? config.port;
  const actualHost = host || config.host || '127.0.0.1';
  const resolvedSessionId =
    sessionId !== undefined ? sessionId : (getActiveSessionId() || 'standalone');

  if (typeof resolvedSessionId !== 'string' || !SESSION_ID_REGEX.test(resolvedSessionId)) {
    throw createHttpError(
      `Invalid session_id "${resolvedSessionId}" for template rendering. Must match ${SESSION_ID_REGEX}.`,
      400
    );
  }

  const templatePath = path.join(pluginRoot, 'skills', 'paint-studio', 'template.html');
  if (!fs.existsSync(templatePath)) {
    throw createHttpError(`Template not found at: ${templatePath}`, 500);
  }

  let html = fs.readFileSync(templatePath, 'utf-8');
  html = html.replace(/__PORT__/g, String(actualPort));
  html = html.replace(/__HOST__/g, String(actualHost));
  html = html.replace(/__SESSION_ID__/g, resolvedSessionId);
  return html;
}

// Validate artifact relative path and enforce allowed extensions & directory containment
function validateArtifactRelativePath(relPath) {
  if (!relPath || typeof relPath !== 'string' || !relPath.trim()) {
    throw createHttpError('Missing or empty artifact filename/path.', 400);
  }
  if (relPath.includes('\0')) {
    throw createHttpError('Invalid artifact filename: null byte detected.', 400);
  }
  if (path.isAbsolute(relPath) || relPath.startsWith('/') || relPath.startsWith('\\')) {
    throw createHttpError(`Invalid artifact filename "${relPath}": must be a relative path.`, 400);
  }

  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    relPath.includes('..') ||
    segments.some((seg) => seg === '..' || seg === '.')
  ) {
    throw createHttpError(
      `Access denied: path traversal sequence ".." is not allowed in "${relPath}".`,
      400
    );
  }

  if (
    normalized === '.system_generated' ||
    normalized.startsWith('.system_generated/') ||
    segments[0] === '.system_generated'
  ) {
    throw createHttpError(
      `Access denied: access to ".system_generated" is forbidden ("${relPath}").`,
      400
    );
  }

  const ext = path.extname(relPath).toLowerCase();
  if (!ALLOWED_ARTIFACT_EXTENSIONS.has(ext)) {
    throw createHttpError(
      `Unsupported file extension "${ext}" for "${relPath}". Allowed extensions: ${Array.from(ALLOWED_ARTIFACT_EXTENSIONS).join(', ')}.`,
      400
    );
  }

  return { normalized, ext };
}

// Scan conversation artifacts and media files (excluding .system_generated)
function scanConversationMedia(sessionDir) {
  if (!fs.existsSync(sessionDir)) {
    return [];
  }
  const realSessionDir = fs.realpathSync(sessionDir);
  const results = [];

  function walk(currentDir, relPrefix = '', source = 'Artifact') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.system_generated'
      ) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

      let realEntryPath;
      try {
        realEntryPath = fs.realpathSync(fullPath);
      } catch (err) {
        console.warn(`[agy-paint] Skipping unresolvable entry "${fullPath}": ${err.message}`);
        continue;
      }

      if (
        realEntryPath !== realSessionDir &&
        !realEntryPath.startsWith(realSessionDir + path.sep)
      ) {
        console.warn(`[agy-paint] Skipping symlink outside session directory: "${fullPath}"`);
        continue;
      }

      const stat = fs.statSync(realEntryPath);
      if (stat.isDirectory()) {
        if (entry.name === '.user_uploaded') {
          walk(fullPath, relPath, 'User Upload');
        } else if (entry.name === '.tempmediaStorage') {
          walk(fullPath, relPath, 'Temp Media');
        } else if (!entry.name.startsWith('.')) {
          walk(fullPath, relPath, source);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_ARTIFACT_EXTENSIONS.has(ext)) {
          results.push({
            filename: relPath,
            displayName: entry.name,
            source,
            size: stat.size,
            modifiedTime: stat.mtimeMs,
            ext,
          });
        }
      }
    }
  }

  walk(sessionDir);
  return results.sort((a, b) => b.modifiedTime - a.modifiedTime);
}

// Read configuration from environment variables (no hardcoded project fallback)
export function getConfig() {
  const portStr = process.env.PORT !== undefined ? String(process.env.PORT).trim() : '7788';
  const port = Number.parseInt(portStr, 10);
  if (
    Number.isNaN(port) ||
    (port !== 0 && (port < 1024 || port > 65535)) ||
    String(port) !== portStr
  ) {
    throw new Error(
      `Invalid PORT environment variable: "${portStr}". Must be 0 (ephemeral) or an integer between 1024 and 65535.`
    );
  }

  return {
    port,
    host: process.env.HOST || '127.0.0.1',
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    model: process.env.MODEL || 'gemini-3.1-flash-lite-image',
  };
}

export const readConfig = getConfig;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.psd': 'image/vnd.adobe.photoshop',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

// Parse JSON request body with strict byte-limit enforcement before buffering
export function parseJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytesRead = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytesRead += chunkBuf.length;
      if (bytesRead > maxBytes) {
        aborted = true;
        req.destroy();
        reject(
          createHttpError(
            `Payload Too Large: request body exceeds limit of ${maxBytes} bytes.`,
            413
          )
        );
        return;
      }
      chunks.push(chunkBuf);
    });

    req.on('end', () => {
      if (aborted) return;
      if (bytesRead === 0) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks, bytesRead).toString('utf-8');
        if (!raw.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(createHttpError(`Malformed JSON request body: ${err.message}`, 400));
      }
    });

    req.on('error', (err) => {
      if (aborted) return;
      reject(err);
    });
  });
}

// Find agentapi CLI path with fail-fast validation
function getAgentApiExecutable() {
  if (process.env.AGENTAPI_BIN) {
    const customBin = process.env.AGENTAPI_BIN.trim();
    if (!fs.existsSync(customBin)) {
      throw createHttpError(
        `Configured AGENTAPI_BIN executable not found at "${customBin}".`,
        500
      );
    }
    return customBin;
  }

  const appDataDir = getAppDataDir();
  const binaryName = process.platform === 'win32' ? 'agentapi.exe' : 'agentapi';
  const binPath = path.join(appDataDir, 'bin', binaryName);
  if (fs.existsSync(binPath)) {
    return binPath;
  }

  const whichCmd = process.platform === 'win32' ? `where ${binaryName}` : `which ${binaryName}`;
  try {
    const resolved = execSync(whichCmd, { stdio: 'pipe', encoding: 'utf-8' }).trim();
    const firstLine = resolved.split('\n')[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch (err) {
    throw createHttpError(
      `agentapi CLI executable not found at "${binPath}" or in system PATH (${err.message}). ` +
        `Ensure Google Antigravity is properly installed.`,
      500
    );
  }

  throw createHttpError(
    `agentapi CLI executable not found at "${binPath}" or in system PATH. ` +
      `Ensure Google Antigravity is properly installed.`,
    500
  );
}

// Apply strict CORS headers restricted to 'null' (sandboxed srcdoc iframes) or loopback origins
function applySecurityAndCorsHeaders(req, res, effectivePort) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  if (origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  } else if (
    typeof origin === 'string' &&
    /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(origin)
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${effectivePort}`);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' file: vscode-webview: vscode-resource: vscode-file: http://127.0.0.1:* http://localhost:*;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// Request Handler
export async function handleRequest(req, res) {
  const startTime = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startTime;
    console.log(
      `[agy-paint HTTP] ${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode} (${elapsed}ms)`
    );
  });

  // Ensure req.destroy() during 413 payload rejection allows the HTTP 413 response to flush cleanly
  if (typeof req.destroy === 'function' && res && typeof res.once === 'function') {
    const origDestroy = req.destroy.bind(req);
    req.destroy = (err) => {
      if (typeof req.pause === 'function') {
        req.pause();
      }
      if (!res.writableEnded) {
        res.setHeader('Connection', 'close');
        res.once('finish', () => origDestroy(err));
        return req;
      }
      return origDestroy(err);
    };
  }

  let config;
  try {
    config = getConfig();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const effectivePort = activeServerPort || req.socket?.localPort || config.port || 7788;
  applySecurityAndCorsHeaders(req, res, effectivePort);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  try {
    // 1. GET /api/health
    if (pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          port: effectivePort,
          host: config.host,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 2. GET /api/template
    if (pathname === '/api/template' && req.method === 'GET') {
      const requestedSessionId = searchParams.has('session_id')
        ? searchParams.get('session_id')
        : (getActiveSessionId() || 'standalone');
      const html = renderCanvasTemplate({
        port: effectivePort,
        host: config.host,
        sessionId: requestedSessionId,
      });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(html);
      return;
    }

    // 3. GET /api/sessions
    if (pathname === '/api/sessions' && req.method === 'GET') {
      const sessions = getRecentSessions();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    // 4. GET /api/session/active
    if (pathname === '/api/session/active' && req.method === 'GET') {
      const activeSession = getActiveSessionId();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ sessionId: activeSession }));
      return;
    }

    // 5. GET /api/artifacts
    if (pathname === '/api/artifacts' && req.method === 'GET') {
      const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
      const sessionDir = resolveSessionBrainDir(sessionId);
      const media = scanConversationMedia(sessionDir);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ artifacts: media, media }));
      return;
    }

    // 6. GET /api/artifact & HEAD /api/artifact
    if (pathname === '/api/artifact' && (req.method === 'GET' || req.method === 'HEAD')) {
      const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
      const filename = searchParams.get('filename') || searchParams.get('path');
      const sessionDir = resolveSessionBrainDir(sessionId);
      const { ext } = validateArtifactRelativePath(filename);

      const targetPath = path.resolve(sessionDir, filename);
      const realSessionDir = fs.realpathSync(sessionDir);

      if (targetPath !== sessionDir && !targetPath.startsWith(sessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: path traversal attempt outside session directory.',
          400
        );
      }

      const lstat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
      if (!lstat) {
        throw createHttpError(`Artifact file not found: "${filename}"`, 404);
      }

      let realTargetPath;
      try {
        realTargetPath = fs.realpathSync(targetPath);
      } catch (err) {
        throw createHttpError(
          `Access denied: unable to resolve real path for "${filename}": ${err.message}`,
          400
        );
      }

      if (!realTargetPath.startsWith(realSessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: resolved artifact path escapes session directory.',
          400
        );
      }

      const stat = fs.statSync(realTargetPath);
      if (!stat.isFile()) {
        throw createHttpError(`Artifact path is not a regular file: "${filename}"`, 400);
      }

      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      };
      if (ext === '.svg') {
        headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
      }

      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const fileData = fs.readFileSync(realTargetPath);
      res.end(fileData);
      return;
    }

    // 7. POST /api/artifact
    if (pathname === '/api/artifact' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const sessionId = body.session_id || body.sessionId;
      const filename = body.filename || body.path;
      const data = body.data ?? body.image;

      const sessionDir = resolveSessionBrainDir(sessionId);
      validateArtifactRelativePath(filename);

      if (!data || typeof data !== 'string' || !data.trim()) {
        throw createHttpError(
          'Missing or invalid "data" in save artifact request. Expected non-empty base64 string.',
          400
        );
      }

      const targetPath = path.resolve(sessionDir, filename);
      if (targetPath !== sessionDir && !targetPath.startsWith(sessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: path traversal attempt outside session directory.',
          400
        );
      }

      const realSessionDir = fs.realpathSync(sessionDir);
      const targetDir = path.dirname(targetPath);

      let existingAncestor = targetDir;
      while (!fs.existsSync(existingAncestor)) {
        const parent = path.dirname(existingAncestor);
        if (parent === existingAncestor) break;
        existingAncestor = parent;
      }
      const realAncestor = fs.realpathSync(existingAncestor);
      if (
        realAncestor !== realSessionDir &&
        !realAncestor.startsWith(realSessionDir + path.sep)
      ) {
        throw createHttpError(
          'Access denied: target ancestor directory escapes session directory.',
          400
        );
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const realParentDir = fs.realpathSync(targetDir);
      if (
        realParentDir !== realSessionDir &&
        !realParentDir.startsWith(realSessionDir + path.sep)
      ) {
        throw createHttpError(
          'Access denied: target parent directory escapes session directory.',
          400
        );
      }

      const existingLstat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
      if (existingLstat) {
        let realExisting;
        try {
          realExisting = fs.realpathSync(targetPath);
        } catch (err) {
          throw createHttpError(
            `Access denied: invalid existing symlink at "${filename}": ${err.message}`,
            400
          );
        }
        if (!realExisting.startsWith(realSessionDir + path.sep)) {
          throw createHttpError(
            'Access denied: target file symlink points outside session directory.',
            400
          );
        }
      }

      const rawBase64 = data.includes(',') ? data.split(',')[1] : data;
      const buffer = Buffer.from(rawBase64, 'base64');
      fs.writeFileSync(targetPath, buffer);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, filename, path: targetPath }));
      return;
    }

    // 8. POST /api/ai/refine
    if (pathname === '/api/ai/refine' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { image, stylePreset, prompt, width, height } = body;

      if (!image || typeof image !== 'string' || !image.trim()) {
        throw createHttpError(
          'Missing or invalid "image" in refine request: must be a non-empty string.',
          400
        );
      }

      const hasStylePreset =
        stylePreset !== undefined && stylePreset !== null && stylePreset !== '';
      const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;

      if (hasStylePreset) {
        if (
          typeof stylePreset !== 'string' ||
          !Object.prototype.hasOwnProperty.call(STYLE_PRESETS, stylePreset)
        ) {
          throw createHttpError(
            `Invalid stylePreset "${stylePreset}". Allowed presets: ${Object.keys(STYLE_PRESETS).join(', ')}.`,
            400
          );
        }
      }

      if (!hasStylePreset && !hasPrompt) {
        throw createHttpError(
          'Invalid refine request: at least one of "stylePreset" or "prompt" is required.',
          400
        );
      }

      const geminiService = new GeminiRefineService(config);
      const result = await geminiService.refineImage({
        image,
        stylePreset: hasStylePreset ? stylePreset : undefined,
        prompt: hasPrompt ? prompt : undefined,
        width,
        height,
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          image: result.image,
          mimeType: result.mimeType,
          text: result.text,
        })
      );
      return;
    }

    // 9. POST /api/send-to-chat
    if (pathname === '/api/send-to-chat' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const sessionId = body.session_id || body.sessionId;
      const { filename, note } = body;
      const image = body.image ?? body.data;

      const sessionDir = resolveSessionBrainDir(sessionId);
      const realSessionDir = fs.realpathSync(sessionDir);

      if (filename !== undefined && filename !== null) {
        if (typeof filename !== 'string' || !SEND_TO_CHAT_FILENAME_REGEX.test(filename)) {
          throw createHttpError(
            `Invalid filename "${filename}" in send-to-chat request. Must match ${SEND_TO_CHAT_FILENAME_REGEX}.`,
            400
          );
        }
      }

      let finalFilename;
      let resolvedPath;

      if (image !== undefined && image !== null && image !== '') {
        if (typeof image !== 'string' || !image.trim()) {
          throw createHttpError('Invalid "image" data in send-to-chat request.', 400);
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        finalFilename = filename || `drawing-${timestamp}.png`;
        if (!SEND_TO_CHAT_FILENAME_REGEX.test(finalFilename)) {
          throw createHttpError(
            `Invalid filename "${finalFilename}" in send-to-chat request.`,
            400
          );
        }
        resolvedPath = path.resolve(sessionDir, finalFilename);
        if (!resolvedPath.startsWith(sessionDir + path.sep)) {
          throw createHttpError(
            'Access denied: path traversal attempt in send-to-chat filename.',
            400
          );
        }

        const existingLstat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (existingLstat) {
          let realExisting;
          try {
            realExisting = fs.realpathSync(resolvedPath);
          } catch (err) {
            throw createHttpError(
              `Access denied: invalid existing symlink "${finalFilename}": ${err.message}`,
              400
            );
          }
          if (!realExisting.startsWith(realSessionDir + path.sep)) {
            throw createHttpError(
              'Access denied: target file symlink points outside session directory.',
              400
            );
          }
        }

        const rawBase64 = image.includes(',') ? image.split(',')[1] : image;
        const buffer = Buffer.from(rawBase64, 'base64');
        fs.writeFileSync(resolvedPath, buffer);

        const realWrittenPath = fs.realpathSync(resolvedPath);
        if (!realWrittenPath.startsWith(realSessionDir + path.sep)) {
          throw createHttpError(
            'Access denied: resolved file path escapes session directory.',
            400
          );
        }
      } else if (filename !== undefined && filename !== null) {
        finalFilename = filename;
        resolvedPath = path.resolve(sessionDir, finalFilename);
        if (!resolvedPath.startsWith(sessionDir + path.sep)) {
          throw createHttpError(
            'Access denied: path traversal attempt in send-to-chat filename.',
            400
          );
        }

        let realTargetPath;
        try {
          realTargetPath = fs.realpathSync(resolvedPath);
        } catch (err) {
          throw createHttpError(
            `Invalid or inaccessible file "${finalFilename}" in session directory: ${err.message}`,
            400
          );
        }

        if (!realTargetPath.startsWith(realSessionDir + path.sep)) {
          throw createHttpError(
            'Access denied: resolved file path escapes session directory.',
            400
          );
        }
      } else {
        throw createHttpError(
          'Missing "image" (or "data") or "filename" in send-to-chat request.',
          400
        );
      }

      const agentApiExe = getAgentApiExecutable();
      let messageContent = `![${finalFilename}](${resolvedPath})\n\n*Drawing sent from agy-paint canvas.*`;
      if (typeof note === 'string' && note.trim()) {
        messageContent = `![${finalFilename}](${resolvedPath})\n\n**Note**: ${note.trim()}\n\n*Drawing sent from agy-paint canvas.*`;
      }

      await new Promise((resolve, reject) => {
        const proc = spawn(
          agentApiExe,
          ['send-message', `--title=Drawing: ${finalFilename}`, sessionId, messageContent],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill('SIGKILL');
          reject(
            createHttpError(
              `agentapi send-message timed out after ${AGENTAPI_TIMEOUT_MS}ms.`,
              504
            )
          );
        }, AGENTAPI_TIMEOUT_MS);

        proc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          if (timedOut) return;
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(
              createHttpError(
                `agentapi send-message failed with exit code ${code}: ${stderr || stdout}`,
                502
              )
            );
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          if (timedOut) return;
          reject(
            createHttpError(
              `Failed to execute agentapi binary "${agentApiExe}": ${err.message}`,
              500
            )
          );
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: true,
          filePath: resolvedPath,
          filename: finalFilename,
        })
      );
      return;
    }

    // 10. GET / and static assets from dist/ (serving Vite-built app)
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname === '/' || pathname === '/index.html') {
        const indexPath = path.join(distPath, 'index.html');
        if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
          throw createHttpError(
            `Built frontend index.html not found at "${indexPath}". Run "npm run build" first.`,
            500
          );
        }
        const content = fs.readFileSync(indexPath);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': content.length,
          'Cache-Control': 'no-cache',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(content);
        return;
      }

      if (!pathname.startsWith('/api/') && !pathname.includes('\0') && !pathname.includes('..')) {
        const staticFilePath = path.resolve(distPath, '.' + pathname);
        if (
          staticFilePath.startsWith(distPath + path.sep) &&
          fs.existsSync(staticFilePath) &&
          fs.statSync(staticFilePath).isFile()
        ) {
          const realDist = fs.realpathSync(distPath);
          const realStatic = fs.realpathSync(staticFilePath);
          if (realStatic.startsWith(realDist + path.sep)) {
            const ext = path.extname(realStatic).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const content = fs.readFileSync(realStatic);
            const headers = {
              'Content-Type': contentType,
              'Content-Length': content.length,
              'X-Content-Type-Options': 'nosniff',
            };
            if (ext === '.svg') {
              headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
            }
            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
              res.end();
              return;
            }
            res.end(content);
            return;
          }
        }
      }
    }

    // Fail-fast 404
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: `Resource not found: ${req.method} ${pathname}`,
        pathname,
        statusCode: 404,
      })
    );
  } catch (err) {
    console.error(`[agy-paint] Error processing ${req.method} ${pathname}:`, err);
    let statusCode = err.statusCode || 500;
    if (!err.statusCode) {
      const msg = err.message || '';
      if (msg.includes('timed out')) {
        statusCode = 504;
      } else if (msg.includes('Payload Too Large') || msg.includes('too large')) {
        statusCode = 413;
      } else if (msg.includes('Access denied') || msg.includes('Illegal filename')) {
        statusCode = 400;
      } else if (msg.includes('not found') || msg.includes('Not found')) {
        statusCode = 404;
      } else if (
        msg.includes('Invalid') ||
        msg.includes('Missing') ||
        msg.includes('Unsupported') ||
        msg.includes('Malformed')
      ) {
        statusCode = 400;
      } else if (msg.includes('Authentication failed')) {
        statusCode = 401;
      }
    }

    if (!res.headersSent) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: err.message, statusCode }));
    }
  }
}

export function createStudioServer() {
  const srv = http.createServer(handleRequest);
  srv.on('listening', () => {
    const addr = srv.address();
    if (addr && typeof addr === 'object' && addr.port) {
      activeServerPort = addr.port;
    }
  });
  srv.on('close', () => {
    activeServerPort = null;
  });
  return srv;
}

export function startServer(options = {}) {
  const config = getConfig();
  const requestedPort =
    typeof options === 'number'
      ? options
      : options.port !== undefined
      ? options.port
      : config.port;
  const requestedHost =
    (typeof options === 'object' && options !== null && options.host) || config.host || '127.0.0.1';

  const srv = createStudioServer();
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      console.error(`[agy-paint] Server error on port ${requestedPort}:`, err);
      reject(err);
    };
    srv.once('error', onError);
    srv.listen(requestedPort, requestedHost, () => {
      srv.removeListener('error', onError);
      const addr = srv.address();
      const boundPort = addr && typeof addr === 'object' ? addr.port : requestedPort;
      activeServerPort = boundPort;
      srv.port = boundPort;
      srv.host = requestedHost;
      srv.server = srv;
      console.log(`[agy-paint sidecar] Listening on http://${requestedHost}:${boundPort}`);
      resolve(srv);
    });
  });
}

// Server lifecycle manager
class ServerManager {
  constructor() {
    this.server = null;
    this.currentPort = null;
    this.currentHost = '127.0.0.1';
  }

  start() {
    const config = getConfig();
    this.currentPort = config.port;
    this.currentHost = config.host;

    this.server = createStudioServer();

    this.server.on('error', (err) => {
      console.error(`[agy-paint] Server error on port ${this.currentPort}:`, err);
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[agy-paint] FATAL: Port ${this.currentPort} is already in use by another process.`
        );
      }
      process.exit(1);
    });

    this.server.listen(this.currentPort, this.currentHost, () => {
      const addr = this.server.address();
      if (addr && typeof addr === 'object' && addr.port) {
        this.currentPort = addr.port;
      }
      console.log(
        `[agy-paint sidecar] Listening on http://${this.currentHost}:${this.currentPort}`
      );
    });

    return this.server;
  }

  stop(callback) {
    if (this.server) {
      const srv = this.server;
      this.server = null;
      activeServerPort = null;
      srv.close(callback);
    } else if (callback) {
      callback();
    }
  }
}

export const manager = new ServerManager();
export const server = createStudioServer();

function gracefulShutdown(signal) {
  console.log(`[agy-paint sidecar] Received ${signal}, shutting down gracefully...`);
  manager.stop((err) => {
    if (err) {
      console.error(`[agy-paint sidecar] Error during shutdown:`, err);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Only auto-listen when server/index.mjs is the entrypoint or imported by sidecar runners
const isDirectRun =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith(path.join('server', 'index.mjs')) ||
    process.argv[1].endsWith('run-sidecar.mjs') ||
    process.argv[1].endsWith(path.join('sidecars', 'studio', 'run.mjs')));

if (isDirectRun && process.env.VITE_DEV_MODE !== '1' && process.env.NODE_ENV !== 'test') {
  manager.start();
}
