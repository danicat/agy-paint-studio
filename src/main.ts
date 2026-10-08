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

import './style.css';
import { CanvasEngine } from './engine/CanvasEngine.ts';
import { Header } from './ui/Header.ts';
import { Toolbar } from './ui/Toolbar.ts';
import { PropertyBar } from './ui/PropertyBar.ts';
import { LayerPanel } from './ui/LayerPanel.ts';
import { NotificationManager } from './ui/Notification.ts';
import { getStudioMode, getFullStudioUrl, onSessionChange } from './utils/api.ts';

function initStudio(): void {
  try {
    const mode = getStudioMode();
    const modeClass = mode === 'preview' ? 'studio-mode-preview' : 'studio-mode-full';

    document.body.classList.remove('studio-mode-preview', 'studio-mode-full');
    document.body.classList.add('studio-container', modeClass);

    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.remove('studio-mode-preview', 'studio-mode-full');
      appEl.classList.add('studio-container', modeClass);
    }

    const appRootEl = document.getElementById('app-root');
    if (appRootEl) {
      appRootEl.classList.remove('studio-mode-preview', 'studio-mode-full');
      appRootEl.classList.add('studio-container', modeClass);
    }

    const viewportContainer = document.getElementById('canvas-viewport-container');
    const headerBar = document.getElementById('header-bar');
    const propertyBarContainer = document.getElementById('property-bar');
    const toolbarContainer = document.getElementById('toolbar-container');
    const layersContainer = document.getElementById('layers-container');

    if (!viewportContainer || !headerBar || !toolbarContainer || !layersContainer) {
      throw new Error(
        'Required DOM containers not found for Paint Studio. ' +
          'Missing elements: ' +
          [
            !viewportContainer && '#canvas-viewport-container',
            !headerBar && '#header-bar',
            !toolbarContainer && '#toolbar-container',
            !layersContainer && '#layers-container'
          ]
            .filter(Boolean)
            .join(', ')
      );
    }

    // Initialize Canvas Engine
    const engine = new CanvasEngine(viewportContainer, 800, 600);

    // Initialize UI Panels
    const header = new Header(engine, headerBar);
    if (propertyBarContainer) {
      new PropertyBar(engine, propertyBarContainer);
    }
    new Toolbar(engine, toolbarContainer);
    new LayerPanel(engine, layersContainer);

    const fullStudioLink = document.getElementById('btn-full-studio') as HTMLAnchorElement | null;
    if (fullStudioLink) {
      fullStudioLink.href = getFullStudioUrl();
      onSessionChange(() => {
        fullStudioLink.href = getFullStudioUrl();
      });
      header.onSessionChange = () => {
        fullStudioLink.href = getFullStudioUrl();
      };
    }

    // Re-fit viewport once layout mode classes have settled
    requestAnimationFrame(() => {
      engine.fitToViewport();
    });

    console.log(`[Paint Studio] Initialized in "${mode}" mode`);
  } catch (err: any) {
    console.error('[Paint Studio] Initialization error:', err);
    NotificationManager.fatal('Application Initialization Failed', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initStudio, { once: true });
} else {
  initStudio();
}

// Global error handlers to fail fast and visibly
window.addEventListener('error', (event) => {
  console.error('[Paint Studio] Uncaught Window Error:', event);
  NotificationManager.fatal('Uncaught Runtime Error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Paint Studio] Unhandled Promise Rejection:', event);
  NotificationManager.fatal('Unhandled Promise Rejection', event.reason);
});
