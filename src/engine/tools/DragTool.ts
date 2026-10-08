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

import { BaseTool, type Point } from './BaseTool.ts';
import type { CanvasEngine } from '../CanvasEngine.ts';

export class DragTool extends BaseTool {
  private isDragging = false;
  private startClientX = 0;
  private startClientY = 0;
  private startPanX = 0;
  private startPanY = 0;
  private lastClickTime = 0;
  private lastClickClientX = 0;
  private lastClickClientY = 0;
  private didMoveOnLastDrag = false;
  private currentDragMoved = false;

  constructor() {
    super('drag', 'Drag / Pan View (H)', 'grab');
  }

  onPointerDown(engine: CanvasEngine, _pt: Point, originalEvent: MouseEvent | TouchEvent): void {
    const { clientX, clientY } = this.getClientCoordinates(originalEvent);
    const now = Date.now();
    const clickDist = Math.hypot(clientX - this.lastClickClientX, clientY - this.lastClickClientY);

    // Double click to recenter and fit view only if previous click did not pan
    if (
      !this.didMoveOnLastDrag &&
      this.lastClickTime > 0 &&
      now - this.lastClickTime <= 300 &&
      clickDist <= 6
    ) {
      engine.fitToViewport();
      this.lastClickTime = 0;
      this.didMoveOnLastDrag = false;
      this.currentDragMoved = false;
      this.isDragging = false;
      return;
    }

    this.lastClickTime = now;
    this.lastClickClientX = clientX;
    this.lastClickClientY = clientY;
    this.currentDragMoved = false;

    this.isDragging = true;
    this.startClientX = clientX;
    this.startClientY = clientY;
    this.startPanX = engine.panX;
    this.startPanY = engine.panY;

    engine.overlayCanvas.style.cursor = 'grabbing';
    engine.container.style.cursor = 'grabbing';
  }

  onPointerMove(engine: CanvasEngine, _pt: Point, originalEvent: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;

    const { clientX, clientY } = this.getClientCoordinates(originalEvent);
    const dx = clientX - this.startClientX;
    const dy = clientY - this.startClientY;

    if (dx !== 0 || dy !== 0) {
      this.currentDragMoved = true;
      this.didMoveOnLastDrag = true;
    }

    engine.panX = this.startPanX + dx;
    engine.panY = this.startPanY + dy;
    engine.applyTransform();
  }

  onPointerUp(engine: CanvasEngine): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.didMoveOnLastDrag = this.currentDragMoved;
      engine.overlayCanvas.style.cursor = 'grab';
      engine.container.style.cursor = 'grab';
    }
  }

  deactivate(engine: CanvasEngine): void {
    this.isDragging = false;
    this.currentDragMoved = false;
    this.didMoveOnLastDrag = false;
    engine.overlayCanvas.style.cursor = 'crosshair';
    engine.container.style.cursor = 'default';
  }

  private getClientCoordinates(originalEvent: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
    if (typeof TouchEvent !== 'undefined' && originalEvent instanceof TouchEvent) {
      const touch = originalEvent.touches[0] || originalEvent.changedTouches[0];
      if (touch) {
        return { clientX: touch.clientX, clientY: touch.clientY };
      }
    }
    if (originalEvent instanceof MouseEvent || ('clientX' in originalEvent && 'clientY' in originalEvent)) {
      return {
        clientX: (originalEvent as MouseEvent).clientX,
        clientY: (originalEvent as MouseEvent).clientY,
      };
    }
    return { clientX: 0, clientY: 0 };
  }
}
