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
import { getApiBaseUrl } from '../utils/api.ts';
import { NotificationManager } from './Notification.ts';

export interface StylePreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  iconSvg: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'auto',
    name: 'Auto',
    badge: 'Smart AI',
    description: 'Automatically polishes and refines your drawing while preserving composition',
    iconSvg: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>'
  },
  {
    id: 'ui_mockup',
    name: 'UI Mockup',
    badge: 'Interface',
    description: 'Clean modern application interface mockup with crisp layout and components',
    iconSvg: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>'
  },
  {
    id: 'diagram',
    name: 'Diagram',
    badge: 'Technical',
    description: 'Structured architecture or flow diagram with crisp nodes and connectors',
    iconSvg: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9"/><line x1="12" y1="13" x2="12" y2="15"/>'
  },
  {
    id: 'icon',
    name: 'Icon',
    badge: 'App Icon',
    description: 'Crisp vector-style icon with balanced geometry and vibrant gradients',
    iconSvg: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
  },
  {
    id: 'sketch',
    name: 'Sketch',
    badge: 'Line Art',
    description: 'Refined hand-drawn illustration with clean ink linework and shading',
    iconSvg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'
  },
  {
    id: 'realistic',
    name: 'Realistic',
    badge: 'Photoreal',
    description: 'High-detail realistic rendering with natural lighting and materials',
    iconSvg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>'
  }
];

export class RefineModal {
  private engine: CanvasEngine;
  private modalEl: HTMLElement | null = null;
  private selectedPresetId: string = 'auto';
  private isProcessing = false;
  private boundEscHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(engine: CanvasEngine) {
    this.engine = engine;
  }

  public open(initialPresetId?: string) {
    if (initialPresetId) {
      this.selectedPresetId = initialPresetId;
    }
    this.createModal();
  }

  public close() {
    if (this.boundEscHandler) {
      window.removeEventListener('keydown', this.boundEscHandler);
      this.boundEscHandler = null;
    }
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    this.isProcessing = false;
  }

  private createModal() {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay refine-modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay && !this.isProcessing) this.close();
    };

    const modal = document.createElement('div');
    modal.className = 'modal-dialog refine-modal-dialog';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <div class="modal-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
          <path d="M19 3v4"></path>
          <path d="M21 5h-4"></path>
        </svg>
        <span>AI Refine Studio</span>
        <span class="refine-badge">Gemini AI</span>
      </div>
      <button class="modal-close-btn" title="Close (Esc)">✕</button>
    `;
    header.querySelector('.modal-close-btn')?.addEventListener('click', () => {
      if (!this.isProcessing) this.close();
    });

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body refine-modal-body';

    const compCanvas = this.engine.getCompositeCanvas();
    const previewDataUrl = compCanvas.toDataURL('image/png');

    // Top Preview Card
    const previewCard = document.createElement('div');
    previewCard.className = 'refine-preview-card';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'refine-thumb-wrapper';
    const sourceImg = document.createElement('img');
    sourceImg.src = previewDataUrl;
    sourceImg.alt = 'Source Sketch';
    sourceImg.className = 'refine-source-img';
    thumbWrap.appendChild(sourceImg);

    const metaWrap = document.createElement('div');
    metaWrap.className = 'refine-canvas-meta';
    const metaTitle = document.createElement('div');
    metaTitle.className = 'refine-meta-title';
    metaTitle.textContent = 'Source Sketch';
    const metaDim = document.createElement('div');
    metaDim.className = 'refine-meta-dim';
    metaDim.textContent = `${this.engine.width} × ${this.engine.height} px • ${this.engine.layers.length} Layers`;
    const metaDesc = document.createElement('div');
    metaDesc.className = 'refine-meta-desc';
    metaDesc.textContent = 'The AI will transform this composite canvas using your selected style preset and instructions.';
    metaWrap.appendChild(metaTitle);
    metaWrap.appendChild(metaDim);
    metaWrap.appendChild(metaDesc);

    previewCard.appendChild(thumbWrap);
    previewCard.appendChild(metaWrap);

    // Style Presets Section
    const presetSection = document.createElement('div');
    presetSection.className = 'refine-section';
    const presetLabel = document.createElement('div');
    presetLabel.className = 'refine-section-label';
    presetLabel.textContent = 'Select Style Preset';
    const presetsGrid = document.createElement('div');
    presetsGrid.className = 'refine-presets-grid';
    presetsGrid.id = 'refine-presets-grid';

    for (const preset of STYLE_PRESETS) {
      const card = document.createElement('div');
      card.className = `refine-preset-card ${preset.id === this.selectedPresetId ? 'active' : ''}`;
      card.dataset.id = preset.id;

      const cardHeader = document.createElement('div');
      cardHeader.className = 'preset-card-header';
      cardHeader.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="preset-card-icon">
          ${preset.iconSvg}
        </svg>
      `;
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'preset-badge';
      badgeSpan.textContent = preset.badge;
      cardHeader.appendChild(badgeSpan);

      const cardTitle = document.createElement('div');
      cardTitle.className = 'preset-card-title';
      cardTitle.textContent = preset.name;

      const cardDesc = document.createElement('div');
      cardDesc.className = 'preset-card-desc';
      cardDesc.textContent = preset.description;

      card.appendChild(cardHeader);
      card.appendChild(cardTitle);
      card.appendChild(cardDesc);
      presetsGrid.appendChild(card);
    }

    presetSection.appendChild(presetLabel);
    presetSection.appendChild(presetsGrid);

    // Prompt Input Section
    const promptSection = document.createElement('div');
    promptSection.className = 'refine-section';
    const promptLabel = document.createElement('div');
    promptLabel.className = 'refine-section-label';
    const promptTitleSpan = document.createElement('span');
    promptTitleSpan.textContent = 'Creative Prompt & Details';
    const promptSubSpan = document.createElement('span');
    promptSubSpan.className = 'refine-label-sub';
    promptSubSpan.textContent = 'Optional instructions to guide colors, subject, or mood';
    promptLabel.appendChild(promptTitleSpan);
    promptLabel.appendChild(promptSubSpan);

    const promptTextarea = document.createElement('textarea');
    promptTextarea.id = 'refine-prompt-input';
    promptTextarea.className = 'refine-prompt-textarea';
    promptTextarea.rows = 2;
    promptTextarea.placeholder = 'e.g. glowing neon lights, warm sunset reflections, serene tranquil atmosphere...';

    promptSection.appendChild(promptLabel);
    promptSection.appendChild(promptTextarea);

    // Layer Destination Option
    const optionsRow = document.createElement('div');
    optionsRow.className = 'refine-options-row';
    const checkLabel = document.createElement('label');
    checkLabel.className = 'checkbox-label text-xs';
    const checkInput = document.createElement('input');
    checkInput.type = 'checkbox';
    checkInput.id = 'refine-new-layer-check';
    checkInput.checked = true;
    const checkText = document.createElement('span');
    checkText.textContent = 'Insert as new non-destructive layer';
    checkLabel.appendChild(checkInput);
    checkLabel.appendChild(checkText);
    optionsRow.appendChild(checkLabel);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'refine-footer';
    const statusMsg = document.createElement('div');
    statusMsg.id = 'refine-status-msg';
    statusMsg.className = 'refine-status-text';
    statusMsg.textContent = 'Ready to refine';

    const actionButtons = document.createElement('div');
    actionButtons.className = 'refine-action-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'refine-cancel-btn';
    cancelBtn.className = 'btn btn-outline';
    cancelBtn.textContent = 'Cancel';

    const submitBtn = document.createElement('button');
    submitBtn.id = 'refine-submit-btn';
    submitBtn.className = 'btn btn-primary btn-refine-submit';
    submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
      </svg>
      <span id="refine-btn-text">Refine Artwork</span>
    `;

    actionButtons.appendChild(cancelBtn);
    actionButtons.appendChild(submitBtn);
    footer.appendChild(statusMsg);
    footer.appendChild(actionButtons);

    body.appendChild(previewCard);
    body.appendChild(presetSection);
    body.appendChild(promptSection);
    body.appendChild(optionsRow);
    body.appendChild(footer);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.modalEl = overlay;

    this.boundEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !this.isProcessing) {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.boundEscHandler);

    this.bindEvents(body);
  }

  private bindEvents(body: HTMLElement) {
    const cards = body.querySelectorAll('.refine-preset-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        if (this.isProcessing) return;
        cards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedPresetId = card.getAttribute('data-id') || 'auto';
      });
    });

    body.querySelector('#refine-cancel-btn')?.addEventListener('click', () => {
      if (!this.isProcessing) this.close();
    });

    const submitBtn = body.querySelector('#refine-submit-btn') as HTMLButtonElement;
    submitBtn?.addEventListener('click', () => {
      this.executeRefine();
    });
  }

  private async executeRefine() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const statusEl = this.modalEl?.querySelector('#refine-status-msg') as HTMLElement | null;
    const submitBtn = this.modalEl?.querySelector('#refine-submit-btn') as HTMLButtonElement | null;
    const btnText = this.modalEl?.querySelector('#refine-btn-text') as HTMLElement | null;
    const promptInput = this.modalEl?.querySelector('#refine-prompt-input') as HTMLTextAreaElement | null;
    const newLayerCheck = this.modalEl?.querySelector('#refine-new-layer-check') as HTMLInputElement | null;

    const asNewLayer = newLayerCheck ? newLayerCheck.checked : true;
    const customPrompt = promptInput ? promptInput.value.trim() : '';

    const selectedPreset = STYLE_PRESETS.find((p) => p.id === this.selectedPresetId) || STYLE_PRESETS[0];
    const stylePreset = selectedPreset.id;

    if (statusEl) {
      statusEl.style.color = 'var(--accent-color)';
      statusEl.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'refine-spinner';
      statusEl.appendChild(spinner);
      statusEl.appendChild(document.createTextNode(` Refining with ${selectedPreset.name}...`));
    }
    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.textContent = 'Generating...';

    NotificationManager.info(`Refining sketch with ${selectedPreset.name}...`, 20000);

    try {
      const compCanvas = this.engine.getCompositeCanvas();
      const base64Data = compCanvas.toDataURL('image/png');

      const payload = {
        image: base64Data,
        stylePreset,
        prompt: customPrompt,
        width: this.engine.width,
        height: this.engine.height
      };

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/ai/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const bodyText = await res.text();
        let errMsg = `HTTP ${res.status}: ${res.statusText}`;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText);
            if (parsed.error) errMsg = parsed.error;
          } catch {
            errMsg = bodyText;
          }
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      const resultImage = result.image || result.imageBase64;
      if (!resultImage) {
        throw new Error('AI service returned an empty image response.');
      }

      const imgSrc = resultImage.startsWith('data:')
        ? resultImage
        : `data:${result.mimeType || 'image/png'};base64,${resultImage}`;

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error('Failed to decode the image returned by the AI refinement model.'));
        image.src = imgSrc;
      });

      const layerName = `Refine: ${selectedPreset.name}`;
      if (asNewLayer) {
        const newLayer = this.engine.addLayer(layerName);
        newLayer.ctx.drawImage(img, 0, 0, this.engine.width, this.engine.height);
      } else {
        const active = this.engine.getActiveLayer();
        if (active) {
          active.name = layerName;
          active.clear();
          active.ctx.drawImage(img, 0, 0, this.engine.width, this.engine.height);
        }
      }

      this.engine.render();
      this.engine.commitHistory();
      NotificationManager.success(`✓ Created refined artwork layer (${selectedPreset.name})!`);
      this.close();
    } catch (err: any) {
      console.error('[RefineModal] Refinement failed:', err);
      if (statusEl) {
        statusEl.style.color = 'var(--danger-color)';
        statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Retry Refine';
      this.isProcessing = false;
      NotificationManager.fatal('AI Refine Failed', err);
    }
  }
}
