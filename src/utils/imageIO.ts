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

import type { CanvasEngine } from '../engine/CanvasEngine.ts';
import { serializePsd } from './psd.ts';

export function encodeArtworkBase64(
  engine: CanvasEngine,
  format: 'psd' | 'png' | 'jpg' | 'webp'
): string {
  if (format === 'psd') {
    const psdBytes = new Uint8Array(serializePsd(engine));
    let binary = '';
    for (let i = 0; i < psdBytes.byteLength; i++) {
      binary += String.fromCharCode(psdBytes[i]);
    }
    return btoa(binary);
  }
  const comp = engine.getCompositeCanvas();
  const mime =
    format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  return comp.toDataURL(mime, 0.95);
}

export function decodeImageElement(
  src: string,
  errorMessage: string
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });
}

export async function loadBlobOrFileIntoEngine(
  engine: CanvasEngine,
  source: Blob,
  displayName: string,
  options: { asNewLayer?: boolean; fitToViewport?: boolean } = {}
): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const img = await decodeImageElement(
      objectUrl,
      `Failed to decode image "${displayName}". The file may be corrupted or in an unsupported format.`
    );

    if (options.asNewLayer) {
      const layer = engine.addLayer(displayName);
      layer.ctx.drawImage(img, 0, 0);
      engine.render();
      engine.commitHistory();
    } else {
      engine.resizeDocument(img.naturalWidth, img.naturalHeight);
      engine.initDefaultDocument();
      const active = engine.getActiveLayer();
      if (active) {
        active.ctx.drawImage(img, 0, 0);
        engine.render();
        engine.commitHistory();
      }
      if (options.fitToViewport) {
        engine.fitToViewport();
      }
    }

    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatAgentArtworkMessage(
  filename: string,
  artifactPath: string,
  comment?: string
): string {
  const trimmed = comment?.trim();
  const imageBlock = `![${filename}](${artifactPath})`;
  return trimmed
    ? `${imageBlock}\n\n${trimmed}\n\n*Sent from Paint Studio.*`
    : `${imageBlock}\n\n*Drawing sent from Paint Studio.*`;
}
