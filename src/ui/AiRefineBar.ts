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
import { parseApiErrorMessage, sidecarFetch } from '../utils/api.ts';
import { decodeImageElement } from '../utils/imageIO.ts';
import { isImeComposing } from './Modal.ts';
import { NotificationManager } from './Notification.ts';

export function mountAiRefineBar(bar: HTMLElement, engine: CanvasEngine): void {
  bar.innerHTML = `
    <div class="ai-preset-group" role="group" aria-label="AI Style Presets">
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="beautify" title="Beautify: Creatively interpret sketch and bring it to life">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
        </svg>
        <span>Beautify</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="apply-notes" title="Apply Notes: Execute drawn or written annotation edits and remove markings">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <span>Notes</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="watercolor" title="Watercolor: Expressive wet-on-wet watercolour painting on textured paper">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
        </svg>
        <span>Watercolor</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="concept-art" title="Concept Art: Polished digital concept art with cinematic lighting">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
        </svg>
        <span>Concept Art</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="vector" title="Vector: Sharp minimalist vector graphic with bold outlines and gradients">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span>Vector</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="pixel-art" title="Pixel Art: Clean 16-bit retro pixel art sprite">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        <span>Pixel Art</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="3d-clay" title="3D Clay: Tactile 3D clay model with soft studio lighting">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span>3D Clay</span>
      </button>
      <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="anime" title="Anime: Cel-shaded anime illustration with expressive linework">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <span>Anime</span>
      </button>
    </div>
    <input
      type="text"
      id="ai-refine-prompt"
      class="input-text ai-prompt-input"
      placeholder="Describe AI changes or click a preset..."
      aria-label="AI refinement prompt"
    />
    <button type="button" id="btn-ai-refine-generate" class="btn btn-xs btn-ai-refine-submit" title="Apply AI prompt to canvas (Enter)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1-1.3-1.3z"></path>
      </svg>
      <span>Refine</span>
    </button>
  `;

  const promptInput = bar.querySelector('#ai-refine-prompt') as HTMLInputElement | null;
  const generateBtn = bar.querySelector('#btn-ai-refine-generate') as HTMLButtonElement | null;
  const presetButtons = bar.querySelectorAll('.ai-preset-btn');
  if (!promptInput || !generateBtn) return;

  const triggerAiRefine = async (presetOverride?: string) => {
    const prompt = promptInput.value.trim();
    const stylePreset = presetOverride || 'beautify';
    if (!presetOverride && !prompt) {
      NotificationManager.info('Type a prompt in the AI bar or click a style preset.');
      promptInput.focus();
      return;
    }
    if (generateBtn.disabled) return;

    const originalHtml = generateBtn.innerHTML;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    presetButtons.forEach((b) => ((b as HTMLButtonElement).disabled = true));

    try {
      const compCanvas = engine.getCompositeCanvas();
      const base64Data = compCanvas.toDataURL('image/png');

      const res = await sidecarFetch('/api/ai/refine', {
        method: 'POST',
        body: JSON.stringify({
          image: base64Data,
          stylePreset,
          prompt: prompt || undefined,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(parseApiErrorMessage(bodyText, res.status, res.statusText));
      }

      const result = await res.json();
      const resultImage = result.image || result.imageBase64;
      if (!resultImage) {
        throw new Error('AI service returned an empty image response.');
      }

      const imgSrc = resultImage.startsWith('data:')
        ? resultImage
        : `data:${result.mimeType || 'image/png'};base64,${resultImage}`;

      const img = await decodeImageElement(
        imgSrc,
        'Failed to decode the image returned by the AI refinement model.'
      );

      const labelSource = prompt || presetOverride || 'Refine';
      const newLayer = engine.addLayer(`AI: ${labelSource.substring(0, 24)}`);
      newLayer.ctx.drawImage(img, 0, 0, engine.width, engine.height);
      engine.render();
      engine.commitHistory();
      promptInput.value = '';
      NotificationManager.success('AI refinement applied as a new layer!');
    } catch (err: unknown) {
      console.error('[AiRefineBar] AI refinement failed:', err);
      NotificationManager.fatal('AI Refine Failed', err);
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = originalHtml;
      presetButtons.forEach((b) => ((b as HTMLButtonElement).disabled = false));
    }
  };

  generateBtn.addEventListener('click', () => {
    void triggerAiRefine();
  });

  promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isImeComposing(e)) {
      e.preventDefault();
      void triggerAiRefine();
    }
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-ai-preset');
      if (preset) {
        void triggerAiRefine(preset);
      }
    });
  });
}
