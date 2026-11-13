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
import { getWorkspaceUris, parseApiErrorMessage, sidecarFetch } from '../utils/api.ts';
import { encodeArtworkBase64 } from '../utils/imageIO.ts';
import { exportPsdFile } from '../utils/psd.ts';
import { mountModal } from './Modal.ts';
import { NotificationManager } from './Notification.ts';

export type SaveFormat = 'psd' | 'png' | 'jpg' | 'webp';

export interface SaveExportState {
  lastSaveDirectory: string;
  lastSaveBasename: string;
}

export function exportRasterImage(
  engine: CanvasEngine,
  format: 'png' | 'jpg' | 'webp',
  customFilename?: string
): void {
  const comp = engine.getCompositeCanvas();
  const mime =
    format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const dataUrl = comp.toDataURL(mime, 0.95);

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = customFilename || `artwork-${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  NotificationManager.success(`Exported ${format.toUpperCase()} image`);
}

export function openSaveExportModal(options: {
  engine: CanvasEngine;
  sessionId: string | null;
  initialFormat: SaveFormat;
  state: SaveExportState;
}): void {
  const { engine, sessionId, initialFormat, state } = options;
  let currentFormat: SaveFormat = initialFormat;
  const baseName = state.lastSaveBasename || `artwork-${Date.now()}`;
  const initialDir = state.lastSaveDirectory || '~/Downloads';

  const mounted = mountModal({
    id: 'save-export-modal-dialog',
    title: initialFormat === 'psd' ? 'Save Project (PSD)' : 'Export Image',
    width: '460px',
    maxWidth: '94vw',
  });

  const { body, titleEl, close } = mounted;
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';

  const form = document.createElement('form');
  form.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
  form.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Format</span>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="save-format-pills">
        <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'psd' ? 'active' : ''}" data-format="psd">PSD (With Layers)</button>
        <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'png' ? 'active' : ''}" data-format="png">PNG</button>
        <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'jpg' ? 'active' : ''}" data-format="jpg">JPEG</button>
        <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'webp' ? 'active' : ''}" data-format="webp">WebP</button>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Destination Folder</span>
        <div id="save-dir-pills" style="display: flex; gap: 4px; flex-wrap: wrap;"></div>
      </div>
      <input type="text" id="save-dir-input" class="input-text" value="${initialDir}" placeholder="~/Downloads" spellcheck="false">
    </div>

    <div style="display: flex; flex-direction: column; gap: 6px;">
      <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Filename</span>
      <input type="text" id="save-filename-input" class="input-text" value="${baseName}.${currentFormat}" placeholder="artwork.${currentFormat}" spellcheck="false">
    </div>

    <div id="save-fullpath-preview" style="font-size: 11px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--surface-hover); padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); word-break: break-all;"></div>

    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 2px;">
      <button type="button" id="save-browser-download-btn" class="btn btn-sm btn-outline" title="Download via Browser">Browser Download</button>
      <div style="display: flex; gap: 8px;">
        <button type="button" id="save-cancel-btn" class="btn btn-sm btn-outline">Cancel</button>
        <button type="submit" id="save-confirm-btn" class="btn btn-sm btn-primary">Save to Filesystem</button>
      </div>
    </div>
  `;
  body.appendChild(form);

  form.querySelector('#save-cancel-btn')?.addEventListener('click', close);

  const dirInput = form.querySelector('#save-dir-input') as HTMLInputElement;
  const filenameInput = form.querySelector('#save-filename-input') as HTMLInputElement;
  const previewEl = form.querySelector('#save-fullpath-preview') as HTMLElement;
  const dirPillsEl = form.querySelector('#save-dir-pills') as HTMLElement;
  const confirmBtn = form.querySelector('#save-confirm-btn') as HTMLButtonElement;
  const browserDownloadBtn = form.querySelector('#save-browser-download-btn') as HTMLButtonElement;
  const formatBtns = form.querySelectorAll('.save-format-btn');

  const ensureExtension = (name: string, fmt: string): string => {
    const stripped =
      name.trim().replace(/\.(psd|png|jpg|jpeg|webp)$/i, '') || `artwork-${Date.now()}`;
    return `${stripped}.${fmt}`;
  };

  const updatePreview = () => {
    const dir = dirInput.value.trim().replace(/\/+$/, '') || '.';
    const fn = ensureExtension(filenameInput.value, currentFormat);
    previewEl.textContent = `${dir}/${fn}`;
  };

  updatePreview();

  formatBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const fmt = btn.getAttribute('data-format') as SaveFormat | null;
      if (!fmt) return;
      currentFormat = fmt;
      formatBtns.forEach((b) => b.classList.toggle('active', b === btn));
      titleEl.textContent =
        currentFormat === 'psd'
          ? 'Save Project (PSD)'
          : `Export ${currentFormat.toUpperCase()} Image`;
      filenameInput.value = ensureExtension(filenameInput.value, currentFormat);
      updatePreview();
    });
  });

  dirInput.addEventListener('input', updatePreview);
  filenameInput.addEventListener('input', updatePreview);

  void (async () => {
    try {
      const workspaceUris = await getWorkspaceUris();
      const query = new URLSearchParams();
      if (sessionId) query.set('session_id', sessionId);
      if (workspaceUris.length > 0) query.set('workspace_uri', workspaceUris[0]);
      const qs = query.toString();
      const res = await sidecarFetch(`/api/fs/info${qs ? `?${qs}` : ''}`);
      if (!res.ok) return;
      const info = await res.json();
      if (!state.lastSaveDirectory && info.defaultDir) {
        dirInput.value = info.defaultDir;
        updatePreview();
      }

      const quickDirs: Array<{ label: string; path: string }> = [];
      if (info.downloadsDir) quickDirs.push({ label: 'Downloads', path: info.downloadsDir });
      if (info.desktopDir) quickDirs.push({ label: 'Desktop', path: info.desktopDir });
      if (info.workspaceDir) quickDirs.push({ label: 'Workspace', path: info.workspaceDir });
      if (info.sessionDir) quickDirs.push({ label: 'Session', path: info.sessionDir });

      dirPillsEl.innerHTML = '';
      for (const q of quickDirs) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'btn btn-xs btn-outline';
        pill.textContent = q.label;
        pill.title = q.path;
        pill.addEventListener('click', () => {
          dirInput.value = q.path;
          updatePreview();
        });
        dirPillsEl.appendChild(pill);
      }
    } catch (err) {
      console.warn('[SaveExportModal] Failed to load filesystem info:', err);
    }
  })();

  const handleFilesystemSave = async () => {
    if (confirmBtn.disabled) return;
    const directory = dirInput.value.trim();
    const finalFilename = ensureExtension(filenameInput.value, currentFormat);
    if (!directory) {
      NotificationManager.error('Missing Directory', 'Specify a destination folder path.');
      return;
    }

    confirmBtn.disabled = true;
    const origText = confirmBtn.textContent;
    confirmBtn.textContent = 'Saving...';

    try {
      const workspaceUris = await getWorkspaceUris();
      const data = encodeArtworkBase64(engine, currentFormat);
      const res = await sidecarFetch('/api/fs/save', {
        method: 'POST',
        body: JSON.stringify({
          directory,
          filename: finalFilename,
          data,
          workspaceUris,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(parseApiErrorMessage(bodyText, res.status, res.statusText));
      }

      const result = await res.json();
      state.lastSaveDirectory = directory;
      state.lastSaveBasename = finalFilename.replace(/\.(psd|png|jpg|jpeg|webp)$/i, '');
      NotificationManager.success(`Saved to ${result.path}`);
      close();
    } catch (err: unknown) {
      console.error('[SaveExportModal] Filesystem save failed:', err);
      NotificationManager.fatal('Save to Filesystem Failed', err);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = origText;
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleFilesystemSave();
  });

  browserDownloadBtn.addEventListener('click', () => {
    const finalFilename = ensureExtension(filenameInput.value, currentFormat);
    try {
      if (currentFormat === 'psd') {
        exportPsdFile(engine, finalFilename);
        NotificationManager.success(`Downloaded "${finalFilename}"`);
      } else {
        exportRasterImage(engine, currentFormat, finalFilename);
      }
      close();
    } catch (err: unknown) {
      NotificationManager.fatal('Download Failed', err);
    }
  });

  filenameInput.focus();
  const dotIndex = filenameInput.value.lastIndexOf('.');
  if (dotIndex > 0) {
    filenameInput.setSelectionRange(0, dotIndex);
  } else {
    filenameInput.select();
  }
}
