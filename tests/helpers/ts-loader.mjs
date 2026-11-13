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
import ts from 'typescript';

const moduleCache = new Map();

export function transpileTsToDataUrl(filePath) {
  const absPath = path.resolve(filePath);
  if (moduleCache.has(absPath)) {
    return moduleCache.get(absPath);
  }
  const source = fs.readFileSync(absPath, 'utf-8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absPath,
  });

  const rewritten = outputText.replace(
    /(from\s+['"])([^'"]+)(['"])/g,
    (_match, prefix, specifier, suffix) => {
      if (specifier.startsWith('.')) {
        if (specifier.endsWith('?raw')) {
          const rawPath = path.resolve(path.dirname(absPath), specifier.slice(0, -4));
          const rawContent = fs.readFileSync(rawPath, 'utf-8');
          const rawUrl = `data:text/javascript;base64,${Buffer.from(
            `export default ${JSON.stringify(rawContent)};`,
            'utf-8'
          ).toString('base64')}`;
          return `${prefix}${rawUrl}${suffix}`;
        }
        let targetPath = path.resolve(path.dirname(absPath), specifier);
        if (!fs.existsSync(targetPath) && fs.existsSync(`${targetPath}.ts`)) {
          targetPath = `${targetPath}.ts`;
        }
        const depUrl = transpileTsToDataUrl(targetPath);
        return `${prefix}${depUrl}${suffix}`;
      }
      return `${prefix}${import.meta.resolve(specifier)}${suffix}`;
    }
  );

  const dataUrl = `data:text/javascript;base64,${Buffer.from(rewritten, 'utf-8').toString('base64')}`;
  moduleCache.set(absPath, dataUrl);
  return dataUrl;
}
