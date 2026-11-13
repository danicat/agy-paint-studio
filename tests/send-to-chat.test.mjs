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

import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transpileTsToDataUrl } from './helpers/ts-loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockDom() {
  const elementsById = new Map();

  function createElement(tagName) {
    const attributes = new Map();
    const listeners = new Map();
    const classes = new Set();
    const children = [];
    let id = '';
    let className = '';
    let value = '';
    let textContent = '';
    let innerHTML = '';
    let focused = false;
    let open = false;
    let parentNode = null;

    const el = {
      tagName: tagName.toUpperCase(),
      style: { cssText: '', display: '' },
      dataset: {},
      disabled: false,
      returnValue: '',
      rows: 0,
      placeholder: '',
      type: '',
      get open() {
        return open;
      },
      set open(v) {
        open = Boolean(v);
      },
      get focused() {
        return focused;
      },
      get id() {
        return id;
      },
      get _rawId() {
        return id;
      },
      set id(val) {
        if (id) elementsById.delete(id);
        id = String(val || '');
        if (id) elementsById.set(id, el);
      },
      get className() {
        return className;
      },
      set className(val) {
        className = String(val || '');
        classes.clear();
        for (const cls of className.split(/\s+/).filter(Boolean)) classes.add(cls);
      },
      classList: {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        contains: (name) => classes.has(name),
      },
      get value() {
        return value;
      },
      set value(v) {
        value = String(v ?? '');
      },
      get textContent() {
        return textContent;
      },
      set textContent(v) {
        textContent = String(v ?? '');
      },
      get innerHTML() {
        return innerHTML;
      },
      set innerHTML(v) {
        innerHTML = String(v ?? '');
        children.length = 0;
      },
      get children() {
        return children;
      },
      setAttribute: (k, v) => {
        if (k === 'id') el.id = v;
        attributes.set(k, String(v));
      },
      getAttribute: (k) => (attributes.has(k) ? attributes.get(k) : null),
      appendChild: (child) => {
        child.parentNode = el;
        children.push(child);
        return child;
      },
      remove: () => {
        const unregisterSubtree = (node) => {
          if (node._rawId) elementsById.delete(node._rawId);
          for (const child of node.children || []) unregisterSubtree(child);
        };
        unregisterSubtree(el);
        open = false;
        if (parentNode && Array.isArray(parentNode.children)) {
          const idx = parentNode.children.indexOf(el);
          if (idx >= 0) parentNode.children.splice(idx, 1);
        }
        parentNode = null;
      },
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent: (event) => {
        const type = typeof event === 'string' ? event : event.type;
        const ev = typeof event === 'string' ? { type, target: el, preventDefault() {} } : event;
        if (!ev.target) ev.target = el;
        for (const fn of listeners.get(type) || []) {
          fn(ev);
        }
        return true;
      },
      focus: () => {
        focused = true;
      },
      select: () => {},
      showModal: () => {
        open = true;
        attributes.set('open', '');
      },
      close: () => {
        open = false;
        attributes.delete('open');
        el.dispatchEvent({ type: 'close', target: el, preventDefault() {} });
      },
      getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 500 }),
    };
    return el;
  }

  const body = createElement('body');
  const document = {
    body,
    createElement,
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (selector) => {
      if (selector === 'dialog[open]') {
        return body.children.find((c) => c.tagName === 'DIALOG' && c.open) || null;
      }
      return null;
    },
    querySelectorAll: () => [],
  };

  return { document, body, elementsById, getElementById: document.getElementById };
}

describe('Send to Chat: formatAgentArtworkMessage & ConversationModal comment flow', () => {
  let formatAgentArtworkMessage;
  let ConversationModal;
  let originalGlobals;

  before(async () => {
    originalGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      HTMLInputElement: globalThis.HTMLInputElement,
      HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
      HTMLSelectElement: globalThis.HTMLSelectElement,
      HTMLDialogElement: globalThis.HTMLDialogElement,
    };

    const dom = createMockDom();
    globalThis.document = dom.document;
    globalThis.HTMLInputElement = class {};
    globalThis.HTMLTextAreaElement = class {};
    globalThis.HTMLSelectElement = class {};
    globalThis.HTMLDialogElement = class {};
    globalThis.window = {
      location: { search: '', protocol: 'http:', href: 'http://127.0.0.1:8080/' },
      addEventListener: () => {},
      removeEventListener: () => {},
      getComputedStyle: () => ({ display: 'flex' }),
      sidecar: {
        conversationId: 'session-123',
        fetch: async () =>
          new Response(JSON.stringify({ sessions: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    };

    const imageIOMod = await import(
      transpileTsToDataUrl(path.resolve(__dirname, '../src/utils/imageIO.ts'))
    );
    const modalMod = await import(
      transpileTsToDataUrl(path.resolve(__dirname, '../src/ui/ConversationModal.ts'))
    );
    formatAgentArtworkMessage = imageIOMod.formatAgentArtworkMessage;
    ConversationModal = modalMod.ConversationModal;
  });

  afterEach(() => {
    const dom = createMockDom();
    globalThis.document = dom.document;
  });

  test('formatAgentArtworkMessage formats optional comment cleanly', () => {
    assert.equal(
      formatAgentArtworkMessage('art.png', '/tmp/art.png', 'Make the hat blue'),
      '![art.png](/tmp/art.png)\n\nMake the hat blue\n\n*Sent from Paint Studio.*'
    );
    assert.equal(
      formatAgentArtworkMessage('art.png', '/tmp/art.png', '   '),
      '![art.png](/tmp/art.png)\n\n*Drawing sent from Paint Studio.*'
    );
    assert.equal(
      formatAgentArtworkMessage('art.png', '/tmp/art.png'),
      '![art.png](/tmp/art.png)\n\n*Drawing sent from Paint Studio.*'
    );
  });

  test('ConversationModal send mode renders #send-chat-comment, prefills valid session, and handles Enter/Shift+Enter/IME/errors', async () => {
    const dom = createMockDom();
    globalThis.document = dom.document;

    let confirmed = null;
    const modal = new ConversationModal();
    modal.open('send', 'session-abc-123', async (sessionId, comment) => {
      confirmed = { sessionId, comment };
    });

    const commentEl = dom.getElementById('send-chat-comment');
    const sessionInput = dom.getElementById('input-conversation-id');
    assert.ok(commentEl, '#send-chat-comment textarea must exist in send mode');
    assert.equal(sessionInput.value, 'session-abc-123');
    assert.equal(commentEl.focused, true, 'comment textarea should receive focus when session is set');

    commentEl.value = 'Fix this button spacing';

    // Shift+Enter should NOT preventDefault or submit
    let shiftDefaultPrevented = false;
    commentEl.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      shiftKey: true,
      isComposing: false,
      keyCode: 13,
      preventDefault: () => {
        shiftDefaultPrevented = true;
      },
    });
    assert.equal(shiftDefaultPrevented, false);
    assert.equal(confirmed, null);

    // IME composing (isComposing or Safari keyCode 229) should NOT submit
    for (const imeProps of [
      { isComposing: true, keyCode: 13 },
      { isComposing: false, keyCode: 229 },
    ]) {
      let imePrevented = false;
      commentEl.dispatchEvent({
        type: 'keydown',
        key: 'Enter',
        shiftKey: false,
        ...imeProps,
        preventDefault: () => {
          imePrevented = true;
        },
      });
      assert.equal(imePrevented, false);
      assert.equal(confirmed, null);
    }

    // Plain Enter submits comment and closes dialog
    let enterPrevented = false;
    commentEl.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      keyCode: 13,
      preventDefault: () => {
        enterPrevented = true;
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(enterPrevented, true);
    assert.deepEqual(confirmed, {
      sessionId: 'session-abc-123',
      comment: 'Fix this button spacing',
    });
    assert.equal(dom.getElementById('send-chat-comment'), null, 'modal should close after submit');

    // Failed send preserves comment and keeps modal open
    const failingModal = new ConversationModal();
    failingModal.open('send', 'standalone', async () => {
      throw new Error('Network error');
    });
    const failInput = dom.getElementById('input-conversation-id');
    const failComment = dom.getElementById('send-chat-comment');
    assert.equal(failInput.value, '', 'standalone must not prefill session input');
    assert.equal(failInput.focused, true, 'missing session must focus conversation ID input');

    failInput.value = 'session-retry-1';
    failComment.value = 'Keep my unsent explanation';
    failComment.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      keyCode: 13,
      preventDefault: () => {},
    });
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(dom.getElementById('send-chat-comment'), 'modal must stay open when send fails');
    assert.equal(dom.getElementById('send-chat-comment').value, 'Keep my unsent explanation');
    failingModal.close();

    // Restore globals
    Object.assign(globalThis, originalGlobals);
  });
});
