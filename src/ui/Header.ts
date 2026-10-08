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
import { exportPsdFile, importPsdFile, serializePsd } from '../utils/psd.ts';
import {
  getApiBaseUrl,
  getSessionId,
  setActiveSessionId,
  onSessionChange,
  getFullStudioUrl
} from '../utils/api.ts';
import { ArtifactModal } from './ArtifactModal.ts';
import { RefineModal } from './RefineModal.ts';
import { ConversationModal } from './ConversationModal.ts';
import { NotificationManager } from './Notification.ts';

export class Header {
  private engine: CanvasEngine;
  private container: HTMLElement;
  private artifactModal: ArtifactModal;
  private refineModal: RefineModal;
  private conversationModal: ConversationModal;
  private sessionId: string | null = null;
  private shortcutsEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private newCanvasEscHandler: ((e: KeyboardEvent) => void) | null = null;
  public onSessionChange: ((sessionId: string) => void) | null = null;

  constructor(engine: CanvasEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;
    this.artifactModal = new ArtifactModal(engine);
    this.refineModal = new RefineModal(engine);

    this.sessionId = getSessionId();
    this.conversationModal = new ConversationModal();

    this.render();
    this.bindEvents();
    this.bindPreviewAiBar();

    this.artifactModal.setSessionId(this.sessionId);

    onSessionChange((updatedId) => {
      if (this.sessionId !== updatedId) {
        this.sessionId = updatedId;
        this.artifactModal.setSessionId(updatedId);
        this.updateSessionUI();
      }
    });

    this.engine.onZoomChange = (zoom) => {
      const zoomBtn = this.container.querySelector('#zoom-reset-btn');
      if (zoomBtn) {
        zoomBtn.textContent = `${Math.round(zoom * 100)}%`;
      }
    };

    this.engine.onHistoryChange = () => {
      const undoBtn = this.container.querySelector('#undo-btn') as HTMLButtonElement | null;
      const redoBtn = this.container.querySelector('#redo-btn') as HTMLButtonElement | null;
      if (undoBtn) undoBtn.disabled = !this.engine.history.canUndo();
      if (redoBtn) redoBtn.disabled = !this.engine.history.canRedo();
    };
  }

  public setSessionId(id: string) {
    setActiveSessionId(id);
    this.sessionId = getSessionId();
    this.artifactModal.setSessionId(this.sessionId);
    this.updateSessionUI();
    if (this.onSessionChange && this.sessionId) {
      this.onSessionChange(this.sessionId);
    }
  }

  private updateSessionUI() {
    const badge = this.container.querySelector('#header-session-badge');
    if (badge) {
      badge.innerHTML = '';
      if (this.sessionId && this.sessionId !== 'standalone') {
        badge.className = 'session-badge connected';
        badge.setAttribute('title', `Connected to session: ${this.sessionId} (Click to switch)`);
        const dot = document.createElement('span');
        dot.className = 'status-dot online';
        const label = document.createElement('span');
        label.className = 'session-id-text';
        label.textContent = `${this.sessionId.substring(0, 8)}...`;
        badge.appendChild(dot);
        badge.appendChild(label);
      } else {
        badge.className = 'session-badge disconnected';
        badge.setAttribute('title', 'Standalone Mode (Click to connect session)');
        const dot = document.createElement('span');
        dot.className = 'status-dot offline';
        const label = document.createElement('span');
        label.className = 'session-id-text';
        label.textContent = 'Standalone';
        badge.appendChild(dot);
        badge.appendChild(label);
      }
    }

    const fullStudioLink = document.getElementById('btn-full-studio') as HTMLAnchorElement | null;
    if (fullStudioLink) {
      fullStudioLink.href = getFullStudioUrl();
    }
  }

  private render() {
    const isConnected = Boolean(this.sessionId && this.sessionId !== 'standalone');

    this.container.innerHTML = `
      <div class="header-left">
        <div class="app-brand">
          <div class="brand-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
            </svg>
          </div>
          <span class="app-title">Paint Studio</span>
        </div>

        <nav class="menu-bar">
          <!-- File Menu -->
          <div class="menu-dropdown">
            <button class="menu-trigger">File ▾</button>
            <div class="menu-content">
              <button class="menu-item" id="menu-new-canvas">
                <span>New Canvas...</span>
                <span class="shortcut">⌘N</span>
              </button>
              <button class="menu-item" id="menu-clear-layer">
                <span>Clear Active Layer</span>
                <span class="shortcut">⌫</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-open-image">
                <span>Open Image as Canvas...</span>
                <span class="shortcut">⌘O</span>
              </button>
              <button class="menu-item" id="menu-import-layer">
                <span>Import Image as Layer...</span>
                <span class="shortcut">⇧⌘I</span>
              </button>
              <button class="menu-item" id="menu-open-psd">
                <span>Open Photoshop PSD...</span>
                <span class="shortcut">⇧⌘O</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-export-png">
                <span>Export PNG</span>
                <span class="shortcut">⇧⌘E</span>
              </button>
              <button class="menu-item" id="menu-export-jpg">
                <span>Export JPEG</span>
              </button>
              <button class="menu-item" id="menu-export-webp">
                <span>Export WebP</span>
              </button>
              <button class="menu-item" id="menu-export-psd">
                <span>Export PSD (With Layers)</span>
                <span class="shortcut">⌘S</span>
              </button>
            </div>
          </div>

          <!-- Edit Menu -->
          <div class="menu-dropdown">
            <button class="menu-trigger">Edit ▾</button>
            <div class="menu-content">
              <button class="menu-item" id="menu-undo">
                <span>Undo</span>
                <span class="shortcut">⌘Z</span>
              </button>
              <button class="menu-item" id="menu-redo">
                <span>Redo</span>
                <span class="shortcut">⇧⌘Z</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-resize-canvas">
                <span>Resize Canvas...</span>
              </button>
              <button class="menu-item" id="menu-flatten-image">
                <span>Flatten All Layers</span>
              </button>
            </div>
          </div>

          <!-- View Menu -->
          <div class="menu-dropdown">
            <button class="menu-trigger">View ▾</button>
            <div class="menu-content">
              <button class="menu-item" id="menu-zoom-in">
                <span>Zoom In</span>
                <span class="shortcut">+</span>
              </button>
              <button class="menu-item" id="menu-zoom-out">
                <span>Zoom Out</span>
                <span class="shortcut">-</span>
              </button>
              <button class="menu-item" id="menu-zoom-100">
                <span>Actual Size (100%)</span>
                <span class="shortcut">⌘0</span>
              </button>
              <button class="menu-item" id="menu-zoom-fit">
                <span>Fit to Screen</span>
                <span class="shortcut">⌘9</span>
              </button>
            </div>
          </div>
        </nav>

        <!-- Hidden file inputs -->
        <input type="file" id="hidden-open-image-input" accept="image/*" style="display: none;">
        <input type="file" id="hidden-import-layer-input" accept="image/*" style="display: none;">
        <input type="file" id="hidden-open-psd-input" accept=".psd,application/octet-stream" style="display: none;">
      </div>

      <div class="header-center">
        <!-- Undo / Redo Quick Controls -->
        <div class="history-controls">
          <button id="undo-btn" class="icon-btn" title="Undo (⌘Z)" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
            </svg>
          </button>
          <button id="redo-btn" class="icon-btn" title="Redo (⇧⌘Z)" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6"></path>
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
            </svg>
          </button>
        </div>

        <div class="header-divider"></div>

        <!-- Zoom Controls -->
        <div class="zoom-controls">
          <button id="zoom-out-btn" class="icon-btn" title="Zoom Out (-)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button id="zoom-reset-btn" class="zoom-badge" title="Click to Fit to Viewport">100%</button>
          <button id="zoom-in-btn" class="icon-btn" title="Zoom In (+)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="header-right">
        <!-- Session Status Pill -->
        <div id="header-session-badge" class="session-badge ${isConnected ? 'connected' : 'disconnected'}" style="cursor: pointer;">
          <span class="status-dot ${isConnected ? 'online' : 'offline'}"></span>
          <span class="session-id-text"></span>
        </div>

        <!-- Switch Conversation Button -->
        <button id="switch-session-btn" class="btn btn-header-action" title="Switch Active Antigravity Conversation">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Session</span>
        </button>

        <!-- Session Artifacts Modal Trigger -->
        <button id="artifacts-btn" class="btn btn-header-action" title="Browse & Save Session Artifacts">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <span>Artifacts</span>
        </button>

        <!-- AI Refine Button -->
        <button id="refine-btn" class="btn btn-header-refine" title="AI Refine & Style Transfer (Gemini)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
            <path d="M19 3v4"></path>
            <path d="M21 5h-4"></path>
          </svg>
          <span>AI Refine</span>
        </button>

        <!-- Keyboard Shortcuts Help Button -->
        <button id="shortcuts-btn" class="icon-btn" title="Keyboard Shortcuts (?)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </button>

        <!-- Full Studio Link (visible in Preview mode) -->
        <a id="btn-full-studio" class="btn btn-header-action preview-only-btn" target="_blank" rel="noopener noreferrer" title="Open Full Studio in Browser Tab">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Full Studio</span>
        </a>

        <!-- Send to Agent Primary Action -->
        <button id="send-to-agent-btn" class="btn btn-send-agent" title="Save & Send Artwork to Active Antigravity Agent">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>Send to Agent</span>
        </button>
      </div>
    `;

    this.updateSessionUI();
  }

  private bindEvents() {
    // Undo / Redo
    this.container.querySelector('#undo-btn')?.addEventListener('click', () => this.engine.undo());
    this.container.querySelector('#redo-btn')?.addEventListener('click', () => this.engine.redo());
    this.container.querySelector('#menu-undo')?.addEventListener('click', () => this.engine.undo());
    this.container.querySelector('#menu-redo')?.addEventListener('click', () => this.engine.redo());

    // Zoom
    this.container.querySelector('#zoom-in-btn')?.addEventListener('click', () => this.engine.zoomAt(0.2));
    this.container.querySelector('#zoom-out-btn')?.addEventListener('click', () => this.engine.zoomAt(-0.2));
    this.container.querySelector('#zoom-reset-btn')?.addEventListener('click', () => this.engine.fitToViewport());

    this.container.querySelector('#menu-zoom-in')?.addEventListener('click', () => this.engine.zoomAt(0.2));
    this.container.querySelector('#menu-zoom-out')?.addEventListener('click', () => this.engine.zoomAt(-0.2));
    this.container.querySelector('#menu-zoom-100')?.addEventListener('click', () => this.engine.resetZoom());
    this.container.querySelector('#menu-zoom-fit')?.addEventListener('click', () => this.engine.fitToViewport());

    // New Canvas (opens dimension prompt modal and resets document)
    this.container.querySelector('#menu-new-canvas')?.addEventListener('click', () => {
      this.openDimensionsModal('new');
    });

    // Clear Active Layer (clears only the currently selected layer)
    this.container.querySelector('#menu-clear-layer')?.addEventListener('click', () => {
      const active = this.engine.getActiveLayer();
      if (!active) return;
      if (active.locked) {
        NotificationManager.info(`Layer "${active.name}" is locked.`);
        return;
      }
      active.clear();
      this.engine.render();
      this.engine.commitHistory();
      NotificationManager.info(`Cleared active layer "${active.name}"`);
    });

    // Resize Canvas
    this.container.querySelector('#menu-resize-canvas')?.addEventListener('click', () => {
      this.openDimensionsModal('resize');
    });

    // Flatten Image
    this.container.querySelector('#menu-flatten-image')?.addEventListener('click', () => {
      this.engine.flatten();
      NotificationManager.info('Flattened all layers into Background');
    });

    // File Open / Import
    const openImageInput = this.container.querySelector('#hidden-open-image-input') as HTMLInputElement | null;
    const importLayerInput = this.container.querySelector('#hidden-import-layer-input') as HTMLInputElement | null;
    const openPsdInput = this.container.querySelector('#hidden-open-psd-input') as HTMLInputElement | null;

    this.container.querySelector('#menu-open-image')?.addEventListener('click', () => openImageInput?.click());
    this.container.querySelector('#menu-import-layer')?.addEventListener('click', () => importLayerInput?.click());
    this.container.querySelector('#menu-open-psd')?.addEventListener('click', () => openPsdInput?.click());

    openImageInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleImageUpload(file, false);
        openImageInput.value = '';
      }
    });

    importLayerInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleImageUpload(file, true);
        importLayerInput.value = '';
      }
    });

    openPsdInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await importPsdFile(file, this.engine);
        NotificationManager.success(`Opened PSD "${file.name}" (${this.engine.layers.length} layers)`);
      } catch (err: any) {
        console.error('[Header] Failed to open PSD:', err);
        NotificationManager.fatal('Failed to Open PSD', err);
      } finally {
        openPsdInput.value = '';
      }
    });

    // Exports
    this.container.querySelector('#menu-export-png')?.addEventListener('click', () => this.exportRaster('png'));
    this.container.querySelector('#menu-export-jpg')?.addEventListener('click', () => this.exportRaster('jpg'));
    this.container.querySelector('#menu-export-webp')?.addEventListener('click', () => this.exportRaster('webp'));
    this.container.querySelector('#menu-export-psd')?.addEventListener('click', () => {
      try {
        exportPsdFile(this.engine, `artwork-${Date.now()}.psd`);
        NotificationManager.success('Exported Photoshop PSD with layers');
      } catch (err: any) {
        NotificationManager.fatal('PSD Export Failed', err);
      }
    });

    // Modals
    this.container.querySelector('#artifacts-btn')?.addEventListener('click', () => {
      this.artifactModal.open();
    });

    this.container.querySelector('#refine-btn')?.addEventListener('click', () => {
      this.refineModal.open();
    });

    this.container.querySelector('#shortcuts-btn')?.addEventListener('click', () => {
      this.openShortcutsModal();
    });

    const openSessionSelector = () => {
      this.conversationModal.open('set', this.sessionId, (newSessionId) => {
        this.setSessionId(newSessionId);
        NotificationManager.success(`Switched active session to ${newSessionId.substring(0, 8)}...`);
      });
    };

    this.container.querySelector('#switch-session-btn')?.addEventListener('click', openSessionSelector);

    this.container.querySelector('#header-session-badge')?.addEventListener('click', openSessionSelector);

    // Send to Agent
    this.container.querySelector('#send-to-agent-btn')?.addEventListener('click', () => {
      if (!this.sessionId || this.sessionId === 'standalone') {
        this.conversationModal.open('send', this.sessionId, async (targetSessionId) => {
          this.setSessionId(targetSessionId);
          await this.handleSendToAgent();
        });
        return;
      }
      this.handleSendToAgent();
    });
  }

  private bindPreviewAiBar() {
    const promptInput = document.getElementById('preview-ai-prompt') as HTMLInputElement | null;
    const generateBtn = document.getElementById('btn-preview-ai-generate') as HTMLButtonElement | null;
    if (!promptInput || !generateBtn) return;

    const triggerQuickAi = async () => {
      const prompt = promptInput.value.trim();
      if (!prompt) {
        NotificationManager.info('Enter a prompt in the AI bar or click AI Refine for presets.');
        promptInput.focus();
        return;
      }
      if (generateBtn.disabled) return;

      const originalHtml = generateBtn.innerHTML;
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';

      try {
        const compCanvas = this.engine.getCompositeCanvas();
        const base64Data = compCanvas.toDataURL('image/png');
        const baseUrl = getApiBaseUrl();

        const res = await fetch(`${baseUrl}/api/ai/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Data,
            stylePreset: 'auto',
            prompt,
            width: this.engine.width,
            height: this.engine.height
          })
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

        const layerName = `AI Preview: ${prompt.substring(0, 24)}`;
        const newLayer = this.engine.addLayer(layerName);
        newLayer.ctx.drawImage(img, 0, 0, this.engine.width, this.engine.height);
        this.engine.render();
        this.engine.commitHistory();
        promptInput.value = '';
        NotificationManager.success('AI refinement applied as a new layer!');
      } catch (err: any) {
        console.error('[Header] Preview AI generation failed:', err);
        NotificationManager.fatal('AI Refine Failed', err);
      } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = originalHtml;
      }
    };

    generateBtn.addEventListener('click', () => {
      triggerQuickAi();
    });

    promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerQuickAi();
      }
    });
  }

  private async handleImageUpload(file: File, asNewLayer: boolean) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error(`FileReader produced an empty result for "${file.name}".`));
          }
        };
        reader.onerror = () => {
          reject(reader.error || new Error(`Failed to read file "${file.name}".`));
        };
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error(`Failed to decode image "${file.name}". The file may be corrupted or in an unsupported format.`));
        image.src = dataUrl;
      });

      if (asNewLayer) {
        const layer = this.engine.addLayer(file.name);
        layer.ctx.drawImage(img, 0, 0);
        this.engine.render();
        this.engine.commitHistory();
        NotificationManager.success(`Imported "${file.name}" as layer`);
      } else {
        this.engine.resizeDocument(img.naturalWidth, img.naturalHeight);
        this.engine.initDefaultDocument();
        const active = this.engine.getActiveLayer();
        if (active) {
          active.ctx.drawImage(img, 0, 0);
          this.engine.render();
          this.engine.commitHistory();
        }
        NotificationManager.success(`Opened "${file.name}" (${img.naturalWidth}×${img.naturalHeight})`);
      }
    } catch (err: any) {
      console.error('[Header] Image upload failed:', err);
      NotificationManager.fatal('Image Load Failed', err);
    }
  }

  private openDimensionsModal(mode: 'new' | 'resize') {
    const existing = document.getElementById('dimensions-modal-overlay');
    if (existing) existing.remove();
    if (this.newCanvasEscHandler) {
      window.removeEventListener('keydown', this.newCanvasEscHandler);
      this.newCanvasEscHandler = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'dimensions-modal-overlay';
    overlay.className = 'modal-overlay';

    const titleText = mode === 'new' ? 'New Canvas' : 'Resize Canvas';
    const actionText = mode === 'new' ? 'Create Canvas' : 'Resize Canvas';

    const modal = document.createElement('div');
    modal.className = 'modal-dialog';
    modal.style.maxWidth = '380px';
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title"><span>${titleText}</span></div>
        <button class="modal-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="800" data-h="600">800×600</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1024" data-h="768">1024×768</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1280" data-h="720">1280×720</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1024" data-h="1024">1024×1024</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1920" data-h="1080">1920×1080</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary);">
            <span>Width (px)</span>
            <input type="number" id="dim-width-input" class="input-text" min="1" max="8192" value="${this.engine.width}">
          </label>
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary);">
            <span>Height (px)</span>
            <input type="number" id="dim-height-input" class="input-text" min="1" max="8192" value="${this.engine.height}">
          </label>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
          <button type="button" id="dim-cancel-btn" class="btn btn-outline">Cancel</button>
          <button type="button" id="dim-confirm-btn" class="btn btn-primary">${actionText}</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
      if (this.newCanvasEscHandler) {
        window.removeEventListener('keydown', this.newCanvasEscHandler);
        this.newCanvasEscHandler = null;
      }
      overlay.remove();
    };

    this.newCanvasEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', this.newCanvasEscHandler);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('#dim-cancel-btn')?.addEventListener('click', closeModal);

    const widthInput = modal.querySelector('#dim-width-input') as HTMLInputElement;
    const heightInput = modal.querySelector('#dim-height-input') as HTMLInputElement;

    modal.querySelectorAll('.dim-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.getAttribute('data-w');
        const h = btn.getAttribute('data-h');
        if (w) widthInput.value = w;
        if (h) heightInput.value = h;
      });
    });

    modal.querySelector('#dim-confirm-btn')?.addEventListener('click', () => {
      const w = parseInt(widthInput.value, 10);
      const h = parseInt(heightInput.value, 10);
      if (isNaN(w) || isNaN(h) || w < 1 || h < 1 || w > 8192 || h > 8192) {
        NotificationManager.error('Invalid Dimensions', 'Width and height must be between 1 and 8192 pixels.');
        return;
      }
      if (mode === 'new') {
        this.engine.resizeDocument(w, h);
        this.engine.initDefaultDocument();
        this.engine.fitToViewport();
        NotificationManager.success(`Created new canvas (${w}×${h})`);
      } else {
        this.engine.resizeDocument(w, h);
        NotificationManager.success(`Resized canvas to ${w}×${h}`);
      }
      closeModal();
    });
  }

  private openShortcutsModal() {
    const existing = document.getElementById('shortcuts-modal');
    if (existing) existing.remove();
    if (this.shortcutsEscHandler) {
      window.removeEventListener('keydown', this.shortcutsEscHandler);
      this.shortcutsEscHandler = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-dialog shortcuts-modal-dialog';
    modal.style.maxWidth = '460px';
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">
          <span>Keyboard Shortcuts</span>
        </div>
        <button class="modal-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="modal-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; font-size: 12px;">
        <div><strong>B</strong> — Brush Tool</div>
        <div><strong>P</strong> — Pencil Tool</div>
        <div><strong>E</strong> — Eraser Tool</div>
        <div><strong>G</strong> — Paint Bucket</div>
        <div><strong>M</strong> — Rectangular Marquee</div>
        <div><strong>U</strong> — Shape Tool</div>
        <div><strong>T</strong> — Text Tool</div>
        <div><strong>I</strong> — Eyedropper</div>
        <div><strong>H / Space</strong> — Pan Canvas</div>
        <div><strong>⌘Z / ⇧⌘Z</strong> — Undo / Redo</div>
        <div><strong>⌘C / ⌘X / ⌘V</strong> — Copy / Cut / Paste</div>
        <div><strong>Esc</strong> — Deselect / Close Modal</div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
      if (this.shortcutsEscHandler) {
        window.removeEventListener('keydown', this.shortcutsEscHandler);
        this.shortcutsEscHandler = null;
      }
      overlay.remove();
    };

    this.shortcutsEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', this.shortcutsEscHandler);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
  }

  private exportRaster(format: 'png' | 'jpg' | 'webp') {
    const comp = this.engine.getCompositeCanvas();
    const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const dataUrl = comp.toDataURL(mime, 0.95);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `artwork-${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    NotificationManager.success(`Exported ${format.toUpperCase()} image`);
  }

  private async handleSendToAgent() {
    if (!this.sessionId) {
      this.sessionId = getSessionId();
    }

    if (!this.sessionId) {
      NotificationManager.error(
        'No Session Connected',
        'Click "Session" in the header to connect to an active Antigravity conversation.'
      );
      return;
    }

    const sendBtn = this.container.querySelector('#send-to-agent-btn') as HTMLButtonElement | null;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const timestamp = Date.now();
      const pngFilename = `paint-studio-${timestamp}.png`;
      const psdFilename = `paint-studio-${timestamp}.psd`;

      NotificationManager.info('Saving PNG & PSD artifacts to active session...');

      const comp = this.engine.getCompositeCanvas();
      const pngBase64 = comp.toDataURL('image/png');

      const psdBuffer = serializePsd(this.engine);
      const psdBytes = new Uint8Array(psdBuffer);
      let binary = '';
      for (let i = 0; i < psdBytes.byteLength; i++) {
        binary += String.fromCharCode(psdBytes[i]);
      }
      const psdBase64 = btoa(binary);

      const baseUrl = getApiBaseUrl();

      // 1. Save PNG
      const pngRes = await fetch(`${baseUrl}/api/artifact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          filename: pngFilename,
          data: pngBase64
        })
      });

      if (!pngRes.ok) {
        const errText = await pngRes.text();
        throw new Error(`Failed to save PNG artifact: ${errText || pngRes.statusText}`);
      }
      const pngResult = await pngRes.json();

      // 2. Save PSD
      const psdRes = await fetch(`${baseUrl}/api/artifact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          filename: psdFilename,
          data: psdBase64
        })
      });

      if (!psdRes.ok) {
        const errText = await psdRes.text();
        throw new Error(`Failed to save PSD artifact: ${errText || psdRes.statusText}`);
      }
      const psdResult = await psdRes.json();

      // 3. Copy agent reference prompt to clipboard
      const promptMessage = `I have created a new drawing in Agy Paint Studio and saved it to the session artifacts:\n- Composite Image: ${pngResult.path}\n- Layered PSD: ${psdResult.path}\nPlease inspect the image and proceed.`;

      try {
        await navigator.clipboard.writeText(promptMessage);
        NotificationManager.success(
          `Saved "${pngFilename}" & "${psdFilename}" to session artifacts! Prompt copied to clipboard.`
        );
      } catch {
        NotificationManager.success(
          `Saved "${pngFilename}" & "${psdFilename}" to session artifacts! Path: ${pngResult.path}`
        );
      }
    } catch (err: any) {
      console.error('[Header] Send to Agent failed:', err);
      NotificationManager.fatal('Send to Agent Failed', err);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }
}
