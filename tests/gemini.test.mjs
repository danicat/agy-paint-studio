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

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL,
  STYLE_PRESETS,
  detectImageMimeType,
  GeminiRefineService,
} from '../server/services/gemini.mjs';

const VALID_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  Buffer.alloc(16),
]);
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG.toString('base64')}`;

describe('Gemini Service: STYLE_PRESETS', () => {
  const EXPECTED_PRESETS = [
    'beautify',
    'apply-notes',
    'watercolor',
    'concept-art',
    'vector',
    'pixel-art',
    '3d-clay',
    'anime',
  ];

  test('exposes the exact 8 UI presets with non-empty prompts and no em dashes', () => {
    assert.deepEqual(Object.keys(STYLE_PRESETS), EXPECTED_PRESETS);
    for (const [key, prompt] of Object.entries(STYLE_PRESETS)) {
      assert.equal(typeof prompt, 'string', `Preset "${key}" must be a string`);
      assert.ok(prompt.trim().length > 20, `Preset "${key}" prompt must be meaningful`);
      assert.ok(!prompt.includes('\u2014'), `Preset "${key}" must not contain em dashes`);
    }
  });
});

describe('Gemini Service: detectImageMimeType & Auth', () => {
  test('detects PNG, JPEG, and WebP magic bytes and rejects invalid buffers', () => {
    assert.equal(detectImageMimeType(VALID_PNG), 'image/png');
    assert.equal(
      detectImageMimeType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)])),
      'image/jpeg'
    );
    const webp = Buffer.alloc(16);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    assert.equal(detectImageMimeType(webp), 'image/webp');

    assert.throws(() => detectImageMimeType(Buffer.from([1, 2, 3])), /Invalid image data/);
    assert.throws(
      () => detectImageMimeType(Buffer.from('GIF89a0000000000', 'ascii')),
      /Unsupported input image format/
    );
  });

  test('getClient initializes API key, Vertex ADC, and fails fast without credentials', async () => {
    const apiClient = await new GeminiRefineService({
      apiKey: 'test-key-123',
      authMode: 'api-key',
    }).getClient();
    assert.ok(apiClient);

    const adcClient = await new GeminiRefineService({
      authMode: 'vertex-adc',
      auth: { getProjectId: async () => 'adc-project-123' },
      location: 'us-central1',
    }).getClient();
    assert.ok(adcClient);

    const prevEnv = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;

    try {
      await assert.rejects(
        () =>
          new GeminiRefineService({
            auth: { getProjectId: async () => '' },
          }).getClient(),
        /Authentication failed/
      );
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });
});

describe('Gemini Service: refineImage()', () => {
  test('combines stylePreset + prompt and returns refined { image, mimeType }', async () => {
    let capturedReq = null;
    const service = new GeminiRefineService({
      client: {
        models: {
          generateContent: async (req) => {
            capturedReq = req;
            return {
              candidates: [
                {
                  finishReason: 'STOP',
                  content: {
                    parts: [
                      { inlineData: { data: 'dGVzdC1vdXRwdXQ=', mimeType: 'image/png' } },
                    ],
                  },
                },
              ],
            };
          },
        },
      },
    });

    const result = await service.refineImage({
      image: VALID_PNG_DATA_URL,
      stylePreset: 'pixel-art',
      prompt: 'make it brighter',
    });

    assert.deepEqual(result, { image: 'dGVzdC1vdXRwdXQ=', mimeType: 'image/png' });
    assert.equal(capturedReq.model, DEFAULT_MODEL);
    assert.equal(capturedReq.contents[0].parts[0].inlineData.mimeType, 'image/png');
    assert.ok(capturedReq.contents[0].parts[1].text.includes(STYLE_PRESETS['pixel-art']));
    assert.ok(capturedReq.contents[0].parts[1].text.includes('make it brighter'));
  });

  test('fails fast on invalid inputs, safety blocks, non-STOP finishReason, and missing image', async () => {
    const makeService = (response) =>
      new GeminiRefineService({
        client: { models: { generateContent: async () => response } },
      });

    await assert.rejects(
      () => makeService({}).refineImage({ image: '', prompt: 'hi' }),
      /Invalid or missing "image"/
    );
    await assert.rejects(
      () => makeService({}).refineImage({ image: VALID_PNG_DATA_URL }),
      /either "stylePreset" or "prompt" is required/
    );
    await assert.rejects(
      () => makeService({}).refineImage({ image: VALID_PNG_DATA_URL, stylePreset: 'bogus' }),
      /Invalid stylePreset/
    );

    await assert.rejects(
      () =>
        makeService({ promptFeedback: { blockReason: 'SAFETY' } }).refineImage({
          image: VALID_PNG_DATA_URL,
          stylePreset: 'beautify',
        }),
      /blockReason="SAFETY"/
    );

    await assert.rejects(
      () =>
        makeService({
          candidates: [{ finishReason: 'OTHER', content: { parts: [] } }],
        }).refineImage({ image: VALID_PNG_DATA_URL, stylePreset: 'beautify' }),
      /finishReason="OTHER"/
    );

    await assert.rejects(
      () =>
        makeService({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no img' }] } }],
        }).refineImage({ image: VALID_PNG_DATA_URL, stylePreset: 'beautify' }),
      /Gemini image refinement failed/
    );
  });

  test('aborts request and rejects with timeout error when timeoutMs elapses', async () => {
    let seenSignal = null;
    const service = new GeminiRefineService({
      timeoutMs: 15,
      client: {
        models: {
          generateContent: (req) => {
            seenSignal = req.config.abortSignal;
            return new Promise(() => {});
          },
        },
      },
    });

    await assert.rejects(
      () =>
        service.refineImage({
          image: VALID_PNG_DATA_URL,
          stylePreset: 'beautify',
        }),
      /timed out/
    );
    assert.equal(seenSignal.aborted, true);
  });
});
