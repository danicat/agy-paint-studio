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

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transpileTsToDataUrl } from './helpers/ts-loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockDom() {
  const elementsById = new Map();
  const windowListeners = new Map();

  function createElement(tagName) {
    const attributes = new Map();
    const listeners = new Map();
    const classes = new Set();
    const children = [];
    let id = '';
    let className = '';
    let textContent = '';
    let innerHTML = '';

    const el = {
      tagName: tagName.toUpperCase(),
      type: '',
      href: '',
      style: {},
      children,
      focused: false,
      classList: {
        add(...names) {
          for (const n of names) classes.add(n);
        },
        remove(...names) {
          for (const n of names) classes.delete(n);
        },
        contains(name) {
          return classes.has(name);
        },
      },
      get id() {
        return id;
      },
      set id(val) {
        if (id) elementsById.delete(id);
        id = String(val);
        if (id) elementsById.set(id, el);
      },
      get className() {
        return className;
      },
      set className(val) {
        className = String(val);
      },
      get textContent() {
        if (children.length > 0 && !textContent) {
          return children.map((c) => c.textContent).join('');
        }
        return textContent;
      },
      set textContent(val) {
        textContent = String(val ?? '');
        if (textContent === '') {
          children.length = 0;
        }
      },
      get innerHTML() {
        return innerHTML;
      },
      set innerHTML(val) {
        innerHTML = String(val ?? '');
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      remove() {
        if (id) elementsById.delete(id);
        const idx = body.children.indexOf(el);
        if (idx !== -1) body.children.splice(idx, 1);
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        const list = listeners.get(type);
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      },
      dispatchEvent(event) {
        for (const fn of [...(listeners.get(event.type) || [])]) {
          fn(event);
        }
      },
      click() {
        el.dispatchEvent({ type: 'click', preventDefault() {} });
      },
      focus() {
        el.focused = true;
      },
      findAllText() {
        const parts = [];
        if (textContent) parts.push(textContent);
        for (const child of children) {
          parts.push(child.findAllText());
        }
        return parts.join('\n');
      },
    };
    return el;
  }

  const body = createElement('body');

  const documentMock = {
    body,
    createElement,
    getElementById(id) {
      return elementsById.get(id) ?? null;
    },
  };

  const windowMock = {
    location: {
      href: 'plugin://agy-paint-studio--studio-60746/?file=%2Ftmp%2Fmissing.png&conversationId=abc-123',
      protocol: 'plugin:',
      hostname: 'agy-paint-studio--studio-60746',
      search: '?file=%2Ftmp%2Fmissing.png&conversationId=abc-123',
    },
    history: {
      replaceStateCalls: [],
      replaceState(_state, _title, nextUrl) {
        windowMock.history.replaceStateCalls.push(nextUrl);
        const parsed = new URL(nextUrl);
        windowMock.location.href = parsed.toString();
        windowMock.location.search = parsed.search;
      },
    },
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = windowListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchEvent(event) {
      for (const fn of [...(windowListeners.get(event.type) || [])]) {
        fn(event);
      }
    },
  };
  windowMock.self = windowMock;
  windowMock.top = windowMock;

  return { documentMock, windowMock, elementsById };
}

describe('File-open error parsing, URL cleanup, and 404 overlay', () => {
  let apiMod;
  let NotificationManager;
  let dom;

  before(async () => {
    dom = createMockDom();
    globalThis.document = dom.documentMock;
    globalThis.window = dom.windowMock;
    globalThis.requestAnimationFrame = (cb) => {
      cb(0);
      return 1;
    };

    const apiUrl = transpileTsToDataUrl(path.resolve(__dirname, '../src/utils/api.ts'));
    apiMod = await import(apiUrl);

    const notifUrl = transpileTsToDataUrl(path.resolve(__dirname, '../src/ui/Notification.ts'));
    const notifMod = await import(notifUrl);
    NotificationManager = notifMod.NotificationManager;
  });

  test('parseApiErrorMessage extracts clean error strings from JSON and plain text', () => {
    const jsonErr = JSON.stringify({
      error: 'File not found: "/Users/petruzalek/.gemini/antigravity/brain/123/scratch/logo.svg.png"',
      statusCode: 404,
    });
    assert.equal(
      apiMod.parseApiErrorMessage(jsonErr, 404, 'Not Found'),
      'File not found: "/Users/petruzalek/.gemini/antigravity/brain/123/scratch/logo.svg.png"'
    );
    assert.equal(apiMod.parseApiErrorMessage('Plain text failure', 500, 'Error'), 'Plain text failure');
    assert.equal(apiMod.parseApiErrorMessage('   ', 404, 'Not Found'), 'HTTP 404: Not Found');
  });

  test('clearInitialFileParam removes file from getFullStudioUrl on plugin: and http: origins', () => {
    const fullLink = dom.documentMock.createElement('a');
    fullLink.id = 'btn-full-studio';
    dom.documentMock.body.appendChild(fullLink);

    // Start on plugin: origin
    dom.windowMock.location = {
      href: 'plugin://agy-paint-studio--studio-60746/?file=%2Ftmp%2Fmissing.png&conversationId=abc-123',
      protocol: 'plugin:',
      hostname: 'agy-paint-studio--studio-60746',
      search: '?file=%2Ftmp%2Fmissing.png&conversationId=abc-123',
    };
    dom.windowMock.history.replaceStateCalls = [];

    assert.ok(apiMod.getFullStudioUrl().includes('file='), 'file param should initially be in Full Mode URL');

    apiMod.clearInitialFileParam();
    assert.equal(
      dom.windowMock.history.replaceStateCalls.length,
      0,
      'Must not call history.replaceState on plugin: origin'
    );
    assert.ok(
      !apiMod.getFullStudioUrl().includes('file='),
      'getFullStudioUrl must omit file param after clearInitialFileParam()'
    );
    assert.ok(!fullLink.href.includes('file='), '#btn-full-studio href must be updated');

    // Now verify http: origin updates browser history cleanly
    dom.windowMock.location = {
      href: 'http://127.0.0.1:60746/?file=%2Ftmp%2Fmissing.png&mode=full&conversationId=abc-123',
      protocol: 'http:',
      hostname: '127.0.0.1',
      search: '?file=%2Ftmp%2Fmissing.png&mode=full&conversationId=abc-123',
    };
    apiMod.clearInitialFileParam();
    assert.equal(dom.windowMock.history.replaceStateCalls.length, 1);
    assert.ok(!dom.windowMock.location.search.includes('file='));
  });

  test('NotificationManager.fileNotFound renders dedicated 404 card and invokes onOpenBlankCanvas once', () => {
    NotificationManager.info('Opening "logo.svg.png"...');

    let blankCount = 0;
    const missingPath = '/Users/petruzalek/.gemini/antigravity/brain/bed364a2/scratch/logo.svg.png';
    NotificationManager.fileNotFound({
      displayName: 'logo.svg.png',
      filePath: missingPath,
      onOpenBlankCanvas: () => {
        blankCount++;
      },
    });

    const overlay = dom.documentMock.getElementById('file-not-found-overlay');
    assert.ok(overlay, 'Expected #file-not-found-overlay to be mounted');
    assert.equal(dom.documentMock.getElementById('fatal-error-overlay'), null);

    const renderedText = overlay.findAllText();
    assert.ok(renderedText.includes('File Not Found'));
    assert.ok(renderedText.includes(missingPath));
    assert.ok(!renderedText.toLowerCase().includes('data corruption'));
    assert.ok(!renderedText.includes('Reload Application'));

    const blankBtn = dom.documentMock.getElementById('file-not-found-blank-btn');
    assert.ok(blankBtn, 'Expected Open Blank Canvas button');
    assert.equal(blankBtn.focused, true);

    blankBtn.click();
    assert.equal(blankCount, 1);
    assert.equal(dom.documentMock.getElementById('file-not-found-overlay'), null);

    // Re-open and verify Escape triggers onOpenBlankCanvas exactly once
    NotificationManager.fileNotFound({
      displayName: 'logo.svg.png',
      filePath: missingPath,
      onOpenBlankCanvas: () => {
        blankCount++;
      },
    });
    dom.windowMock.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
    dom.windowMock.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
    assert.equal(blankCount, 2);
    assert.equal(dom.documentMock.getElementById('file-not-found-overlay'), null);
  });
});
