/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vite';

const port = parseInt(process.env.PORT || '7777', 10);
const host = '127.0.0.1';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  },
  server: {
    port,
    host,
    strictPort: true, // Fail-fast: error out visibly if the port is in use
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Content-Security-Policy': 'frame-ancestors *'
    }
  },
  plugins: [
    {
      name: 'agy-paint-sidecar-api',
      async configureServer(server) {
        process.env.VITE_DEV_MODE = '1';
        const { handleRequest } = await import('./server/index.mjs');
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/')) {
            await handleRequest(req, res);
            return;
          }
          next();
        });
      }
    }
  ]
});
