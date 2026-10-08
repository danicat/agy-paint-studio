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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const distIndexHtml = path.join(distDir, 'index.html');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(distDir) || !fs.existsSync(distIndexHtml) || !fs.existsSync(assetsDir)) {
  console.error(
    `[bundle-studio-artifact] FATAL: Required build output missing in "${distDir}". Run "vite build" first.`
  );
  process.exit(1);
}

const assetFiles = fs.readdirSync(assetsDir);
const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));
const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));

if (cssFiles.length === 0 || jsFiles.length === 0) {
  console.error(
    `[bundle-studio-artifact] FATAL: Could not find compiled .css and .js assets in "${assetsDir}".`
  );
  process.exit(1);
}

const cssContent = cssFiles
  .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf-8'))
  .join('\n');
const jsContent = jsFiles
  .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf-8'))
  .join('\n')
  .replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(distIndexHtml, 'utf-8');

// Remove external Vite asset tags so the bundle is 100% self-contained
html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
html = html.replace(/<script[^>]*src=["'][^"']*\/assets\/[^"']*["'][^>]*><\/script>/gi, '');

// Replace relative icon link with inline data URI SVG
const inlineIconDataUri =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2'%3E%3Ccircle cx='13.5' cy='6.5' r='.5' fill='%236366f1'/%3E%3Ccircle cx='17.5' cy='10.5' r='.5' fill='%236366f1'/%3E%3Ccircle cx='8.5' cy='7.5' r='.5' fill='%236366f1'/%3E%3Ccircle cx='6.5' cy='12.5' r='.5' fill='%236366f1'/%3E%3Cpath d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z'/%3E%3C/svg%3E";
html = html.replace(
  /<link[^>]*rel=["']icon["'][^>]*>/gi,
  `<link rel="icon" type="image/svg+xml" href="${inlineIconDataUri}" />`
);

const studioConfigScript = `  <script>
    window.__STUDIO_CONFIG__ = {
      port: "__PORT__",
      host: "__HOST__",
      sessionId: "__SESSION_ID__"
    };
  </script>`;

const licenseComment = `<!--
 Copyright 2026 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
-->`;

if (!html.includes('Licensed under the Apache License')) {
  html = html.replace(/<!DOCTYPE html>/i, `<!DOCTYPE html>\n${licenseComment}`);
}

// Inject runtime token config at the top of <head>
html = html.replace(/<head>/i, () => `<head>\n${studioConfigScript}`);

// Inject compiled CSS before </head>
html = html.replace(/<\/head>/i, () => `  <style>\n${cssContent}\n  </style>\n</head>`);

// Inject compiled JS module before </body>
html = html.replace(/<\/body>/i, () => `  <script type="module">\n${jsContent}\n  </script>\n</body>`);

// 1. Write to skills/paint-studio/template.html
const studioSkillDir = path.join(rootDir, 'skills', 'paint-studio');
fs.mkdirSync(studioSkillDir, { recursive: true });
const studioSkillTemplate = path.join(studioSkillDir, 'template.html');
fs.writeFileSync(studioSkillTemplate, html, 'utf-8');
console.log(
  `[bundle-studio-artifact] Wrote studio skill template to ${studioSkillTemplate} (${(html.length / 1024).toFixed(1)} KB)`
);

// 2. Write to dist/paint-studio.html
const distBundle = path.join(distDir, 'paint-studio.html');
fs.writeFileSync(distBundle, html, 'utf-8');
console.log(
  `[bundle-studio-artifact] Wrote self-contained studio bundle to ${distBundle} (${(html.length / 1024).toFixed(1)} KB)`
);
