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
import {
  getStudioMode,
  isInlineEmbed,
  type StudioMode
} from './utils/api.ts';

function applyStudioModeClasses(mode: StudioMode): void {
  const modeClass = mode === 'preview' ? 'studio-mode-preview' : 'studio-mode-full';
  const inlineEmbed = isInlineEmbed();

  document.body.classList.remove('studio-mode-preview', 'studio-mode-full', 'studio-mode-inline');
  document.body.classList.add('studio-container', modeClass);
  if (inlineEmbed) {
    document.body.classList.add('studio-mode-inline');
  }

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.classList.remove('studio-mode-preview', 'studio-mode-full', 'studio-mode-inline');
    appEl.classList.add('studio-container', modeClass);
    if (inlineEmbed) {
      appEl.classList.add('studio-mode-inline');
    }
  }

  const appRootEl = document.getElementById('app-root');
  if (appRootEl) {
    appRootEl.classList.remove('studio-mode-preview', 'studio-mode-full', 'studio-mode-inline');
    appRootEl.classList.add('studio-container', modeClass);
    if (inlineEmbed) {
      appRootEl.classList.add('studio-mode-inline');
    }
  }
}

function initStudio(): void {
  try {
    const mode = getStudioMode();
    applyStudioModeClasses(mode);

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
    new Header(engine, headerBar);
    if (propertyBarContainer) {
      new PropertyBar(engine, propertyBarContainer);
    }
    new Toolbar(engine, toolbarContainer);
    new LayerPanel(engine, layersContainer);

    // Re-fit viewport once layout mode classes have settled
    requestAnimationFrame(() => {
      engine.fitToViewport();
    });

    // Dynamically switch between compact preview and full studio layout when Aux Pane is resized/maximized
    let currentMode = mode;
    window.addEventListener('resize', () => {
      const nextMode = getStudioMode();
      if (nextMode !== currentMode) {
        currentMode = nextMode;
        applyStudioModeClasses(nextMode);
        requestAnimationFrame(() => {
          engine.fitToViewport();
        });
      }
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
