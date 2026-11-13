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

export interface MountedModal {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  titleEl: HTMLElement;
  close: () => void;
}

export interface MountModalOptions {
  id?: string;
  title: string;
  className?: string;
  width?: string;
  maxWidth?: string;
  titleIconSvg?: string;
  onClose?: () => void;
}

let nextModalTitleId = 0;

export function isImeComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

export function shouldIgnoreCanvasShortcut(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    Boolean(target?.isContentEditable)
  ) {
    return true;
  }

  if (document.querySelector('dialog[open]')) {
    return true;
  }

  const overlays = document.querySelectorAll('.modal-overlay');
  for (const overlay of overlays) {
    const el = overlay as HTMLElement;
    const computedDisplay =
      typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(el).display
        : el.style.display;
    if (el.style.display !== 'none' && computedDisplay !== 'none') {
      return true;
    }
  }

  return false;
}

export function mountModal(options: MountModalOptions): MountedModal {
  if (options.id) {
    const existing = document.getElementById(options.id);
    if (existing) {
      if (existing instanceof HTMLDialogElement && existing.open) {
        existing.close();
      }
      existing.remove();
    }
  }

  const dialog = document.createElement('dialog');
  dialog.className = options.className
    ? `modal-dialog ${options.className}`
    : 'modal-dialog';
  if (options.id) {
    dialog.id = options.id;
  }
  dialog.setAttribute('closedby', 'any');

  const titleId = `modal-title-${++nextModalTitleId}`;
  dialog.setAttribute('aria-labelledby', titleId);

  if (options.width) dialog.style.width = options.width;
  if (options.maxWidth) dialog.style.maxWidth = options.maxWidth;

  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'modal-title';
  if (options.titleIconSvg) {
    titleWrap.innerHTML = options.titleIconSvg;
  }
  const titleEl = document.createElement('h2');
  titleEl.id = titleId;
  titleEl.className = 'modal-title-heading';
  titleEl.textContent = options.title;
  titleWrap.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-btn';
  closeBtn.title = 'Close (Esc)';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.textContent = '✕';

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';

  dialog.appendChild(header);
  dialog.appendChild(body);
  document.body.appendChild(dialog);

  let isClosed = false;
  const finalizeClose = () => {
    if (isClosed) return;
    isClosed = true;
    dialog.returnValue = '';
    if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
    dialog.remove();
    options.onClose?.();
  };

  closeBtn.addEventListener('click', finalizeClose);
  dialog.addEventListener('close', finalizeClose);

  // Light-dismiss fallback for browsers without closedby="any": require press and release outside
  let startedOutside = false;
  const isPointOutsideDialog = (clientX: number, clientY: number) => {
    const rect = dialog.getBoundingClientRect();
    return (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    );
  };

  dialog.addEventListener('pointerdown', (e) => {
    startedOutside = e.target === dialog && isPointOutsideDialog(e.clientX, e.clientY);
  });
  dialog.addEventListener('pointerup', (e) => {
    if (startedOutside && e.target === dialog && isPointOutsideDialog(e.clientX, e.clientY)) {
      startedOutside = false;
      finalizeClose();
      return;
    }
    startedOutside = false;
  });

  dialog.showModal();

  return { dialog, body, titleEl, close: finalizeClose };
}
