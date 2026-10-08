/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface StudioConfig {
  port?: string | number;
  host?: string;
  sessionId?: string;
  apiBaseUrl?: string;
  mode?: 'preview' | 'full';
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

declare global {
  interface Window {
    __STUDIO_CONFIG__?: StudioConfig;
    __PORT__?: string | number;
    __HOST__?: string;
    __SESSION_ID__?: string;
    __API_BASE_URL__?: string;
  }
}

let activeSessionId: string | null = null;
const sessionChangeListeners: Array<(sessionId: string) => void> = [];

function isConfiguredToken(val: unknown): val is string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return true;
  }
  if (typeof val !== 'string') {
    return false;
  }
  const trimmed = val.trim();
  return trimmed.length > 0 && !(trimmed.startsWith('__') && trimmed.endsWith('__'));
}

/**
 * Resolve the active runtime port from injected `window.__STUDIO_CONFIG__` or `window.location`.
 * Fails fast with a descriptive configuration error if unconfigured on a non-HTTP(S) protocol.
 */
export function getRuntimePort(): string {
  const cfgPort = window.__STUDIO_CONFIG__?.port ?? window.__PORT__;
  if (isConfiguredToken(cfgPort)) {
    const portStr = String(cfgPort).trim();
    const portNum = Number(portStr);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(
        `[Paint Studio Config Error] Invalid port "${portStr}" in window.__STUDIO_CONFIG__.port. Must be an integer between 1 and 65535.`
      );
    }
    return portStr;
  }

  const protocol = window.location.protocol;
  if (protocol === 'http:' || protocol === 'https:') {
    if (window.location.port) {
      return window.location.port;
    }
    return protocol === 'https:' ? '443' : '80';
  }

  throw new Error(
    `[Paint Studio Config Error] Unable to resolve runtime server port: ` +
      `window.__STUDIO_CONFIG__.port is unreplaced or missing, and document is running on ` +
      `protocol "${protocol}" with an empty window.location.port.`
  );
}

/**
 * Resolve the active runtime host from injected `window.__STUDIO_CONFIG__` or `window.location`.
 * Fails fast with a descriptive configuration error if unconfigured on a non-HTTP(S) protocol.
 */
export function getRuntimeHost(): string {
  const cfgHost = window.__STUDIO_CONFIG__?.host ?? window.__HOST__;
  if (isConfiguredToken(cfgHost)) {
    return String(cfgHost).trim();
  }

  const protocol = window.location.protocol;
  if ((protocol === 'http:' || protocol === 'https:') && window.location.hostname) {
    return window.location.hostname;
  }

  throw new Error(
    `[Paint Studio Config Error] Unable to resolve runtime server host: ` +
      `window.__STUDIO_CONFIG__.host is unreplaced or missing, and document is running on ` +
      `protocol "${protocol}" without a valid window.location.hostname.`
  );
}

/**
 * Resolve the base URL for all Paint Studio HTTP sidecar API calls.
 */
export function getApiBaseUrl(): string {
  const cfgBaseUrl = window.__STUDIO_CONFIG__?.apiBaseUrl ?? window.__API_BASE_URL__;
  if (isConfiguredToken(cfgBaseUrl)) {
    return String(cfgBaseUrl).trim().replace(/\/+$/, '');
  }

  const host = getRuntimeHost();
  const port = getRuntimePort();
  const hasInjectedPort = isConfiguredToken(window.__STUDIO_CONFIG__?.port ?? window.__PORT__);
  const scheme =
    !hasInjectedPort && window.location.protocol === 'https:' ? 'https' : 'http';

  if (
    !hasInjectedPort &&
    !window.location.port &&
    ((scheme === 'http' && port === '80') || (scheme === 'https' && port === '443'))
  ) {
    return `${scheme}://${host}`;
  }

  return `${scheme}://${host}:${port}`;
}

const VALID_SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Resolve the initial session ID from query parameters, `window.__STUDIO_CONFIG__`, or brain path.
 */
export function getInitialSessionId(): string {
  const params = new URLSearchParams(window.location.search);
  const querySessionId = params.get('session_id')?.trim();
  if (
    querySessionId &&
    isConfiguredToken(querySessionId) &&
    VALID_SESSION_ID_REGEX.test(querySessionId)
  ) {
    return querySessionId;
  }

  const cfgSessionId = window.__STUDIO_CONFIG__?.sessionId ?? window.__SESSION_ID__;
  if (isConfiguredToken(cfgSessionId)) {
    const trimmed = String(cfgSessionId).trim();
    if (VALID_SESSION_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }

  const pathMatch = window.location.pathname.match(/\/brain\/([a-zA-Z0-9_-]{1,128})(?:\/|$)/);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  return '';
}

/**
 * Get the currently active session ID.
 */
export function getActiveSessionId(): string {
  if (activeSessionId === null) {
    activeSessionId = getInitialSessionId();
  }
  return activeSessionId;
}

/**
 * Get the currently active session ID or null if not yet connected.
 */
export function getSessionId(): string | null {
  const current = getActiveSessionId();
  return current ? current : null;
}

/**
 * Update the active session ID and notify all registered listeners.
 */
export function setActiveSessionId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
    throw new Error(
      `Invalid session_id "${id}". Must be 1-128 alphanumeric, underscore, or hyphen characters.`
    );
  }

  activeSessionId = trimmed;
  if (window.__STUDIO_CONFIG__) {
    window.__STUDIO_CONFIG__.sessionId = trimmed;
  }

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    const url = new URL(window.location.href);
    url.searchParams.set('session_id', trimmed);
    window.history.replaceState({}, '', url.toString());
  }

  for (const cb of sessionChangeListeners) {
    cb(trimmed);
  }
}

/**
 * Alias for setActiveSessionId() for callers updating the active session.
 */
export function setSessionId(id: string): void {
  setActiveSessionId(id);
}

/**
 * Subscribe to active session ID changes.
 */
export function onSessionChange(cb: (sessionId: string) => void): void {
  sessionChangeListeners.push(cb);
}

/**
 * Determine whether the studio is running in inline 'preview' mode or 'full' studio mode.
 */
export function getStudioMode(): 'preview' | 'full' {
  const modeParam = new URLSearchParams(window.location.search).get('mode');
  if (modeParam === 'preview') {
    return 'preview';
  }
  if (modeParam === 'full') {
    return 'full';
  }

  if (window.__STUDIO_CONFIG__?.mode === 'preview') {
    return 'preview';
  }
  if (window.__STUDIO_CONFIG__?.mode === 'full') {
    return 'full';
  }

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }

  const isEmbeddedProtocol =
    window.location.protocol === 'about:' ||
    window.location.href.startsWith('about:srcdoc') ||
    window.location.pathname === 'srcdoc';

  if (inIframe || isEmbeddedProtocol) {
    return 'preview';
  }

  return 'full';
}

/**
 * Construct the URL to open the Full Studio in a top-level browser tab for the active session.
 */
export function getFullStudioUrl(): string {
  return `${getApiBaseUrl()}/?mode=full&session_id=${encodeURIComponent(getActiveSessionId())}`;
}

/**
 * Fetch the latest active session ID from the sidecar server.
 */
export async function fetchActiveSessionId(): Promise<string | null> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/session/active`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch active session ID: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const resolved = typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : null;
  if (resolved && !activeSessionId) {
    activeSessionId = resolved;
  }
  return resolved;
}

/**
 * Fetch the list of recent sessions discovered by the sidecar server.
 */
export async function fetchRecentSessions(): Promise<SessionSummary[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/sessions`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch recent sessions: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data.sessions) ? data.sessions : [];
}
