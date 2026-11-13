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

import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite-image';

export const STYLE_PRESETS = {
  beautify:
    "Imaginatively interpret this sketch or image and bring the underlying concept to life as a vibrant, studio-quality illustration. Look past rough mouse lines, stick figures, or basic geometric shorthand to recognize what the user intends to depict, and flesh it out with rich artistic detail, appealing character design, natural structure, depth, and expressive lighting (for example, turn a stick figure into a lively, fully realized character in that exact pose, or a rough doodle of a cat into a charming, detailed illustrated cat). Stay faithfully anchored to the user's subjects, spatial layout, poses, and chosen color palette without tracing crude geometry literally or inventing unrelated scene elements.",
  'apply-notes':
    "Carefully inspect this image for visual annotations, including redlines, arrows, circled regions, rough sketched additions, and handwritten or typed text notes describing edits. Interpret the creative intent behind both the written instructions and any rough sketched-in shapes, seamlessly integrating the requested changes with full artistic detail that matches the surrounding artwork's style, lighting, perspective, and palette. Completely remove all annotation text, arrows, circles, and markup lines from the final result.",
  watercolor:
    "Re-imagine and paint this sketch or image as an expressive, gallery-quality watercolor artwork on textured cold-press paper. Translate crude outlines or shorthand shapes into organic, artfully constructed forms rendered with luminous wet-on-wet washes, natural pigment granulation, delicate color bleeding, intentional unpainted paper highlights, and lively brushwork. Faithfully preserve the user's depicted subjects, poses, spatial composition, and color cues rather than painting an unrelated scene.",
  'concept-art':
    "Elevate this sketch or image into a richly detailed digital concept art illustration suitable for a feature film or AAA game production. Interpret rough shapes, stick figures, or block-outs as thumbnail storyboards, fleshing them out with believable anatomy, intricate material textures, atmospheric perspective, volumetric lighting, and dramatic rim highlights. Keep the composition, subjects, poses, and key color cues anchored to the user's drawing so the result feels like a master concept artist's finished painting of the exact same scene.",
  vector:
    "Redesign and polish this sketch or image into a crisp, modern vector illustration with clean geometric construction, intentional curves, bold balanced linework, and vibrant flat-to-gradient colorblocking. Do not literally trace wobbly or jagged hand-drawn strokes; instead, reconstruct the depicted subjects with professional graphic design precision, pleasing proportions, and iconic visual clarity while faithfully preserving the subject matter, pose, layout, and color scheme.",
  'pixel-art':
    "Re-imagine and craft this sketch or image as authentic 16-bit era pixel art with deliberate pixel cluster placement, clean hand-pixelled outlines, selective dithering, and a cohesive arcade color palette. Translate rough doodles or stick figures into charming, expressive game sprites or pixel scenes with readable silhouettes and rich pixel-level detail, rather than merely downsampling or pixelating the raw strokes. Preserve the user's subjects, poses, layout, and primary colors.",
  '3d-clay':
    "Sculpt and render the subjects in this sketch or image as a charming, tactile 3D stop-motion claymation diorama or handcrafted polymer clay miniature. Interpret rough 2D shorthand or stick figures as fully sculpted, volumetric 3D characters and objects with rounded forms, subtle fingerprint and tool textures, soft subsurface scattering, warm studio key lighting, and shallow miniature depth of field. Preserve the exact subjects, poses, spatial arrangement, and color palette from the user's drawing.",
  anime:
    "Polish and re-imagine this sketch, drawing, or image as a high-quality Japanese anime illustration with crisp, dynamic ink linework, vibrant cel-shading, clean multi-tone shadow planes, and classic anime specular highlights. Look past rough sketch lines or stick-figure shorthand to construct appealing anime character anatomy, expressive eyes, flowing hair and fabric folds, or richly detailed anime props and environments as appropriate to what is drawn. Strictly preserve the user's subject matter, pose, spatial layout, and primary color cues without replacing the subject with an unprompted background scene.",
};

const SYSTEM_INSTRUCTION =
  "You are an imaginative master digital artist and visual development illustrator. When given a rough sketch, doodle, or image, look past crude mouse-drawn lines or stick-figure shorthand to understand the underlying concept and creative intent. Re-imagine and flesh out symbolic sketches into rich, believable, artfully constructed subjects with proper anatomy, structure, volume, and detail, while staying faithfully anchored to the user's subjects, poses, spatial layout, and intentional color cues. Never merely trace wobbly lines with a surface filter, and never ignore the user's drawing to hallucinate unrelated scenes.";

export function detectImageMimeType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) {
    throw new Error('Invalid image data: buffer is empty or corrupted.');
  }

  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    return 'image/jpeg';
  }

  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  throw new Error(
    'Unsupported input image format. Supported formats are: png, jpeg, webp.'
  );
}

function extractBase64Payload(image) {
  if (typeof image !== 'string' || !image.trim()) {
    throw new Error(
      'Invalid or missing "image" in AI refinement request: must be a non-empty base64 string or data URL.'
    );
  }

  const trimmed = image.trim();
  let rawBase64 = trimmed;

  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid data URL in "image": missing comma separator.');
    }
    if (!trimmed.slice(0, commaIndex).includes(';base64')) {
      throw new Error('Invalid data URL in "image": must be base64-encoded.');
    }
    rawBase64 = trimmed.slice(commaIndex + 1);
  } else if (trimmed.includes(',')) {
    throw new Error(
      'Invalid "image" string: unexpected comma without "data:" prefix.'
    );
  }

  const cleanBase64 = rawBase64.replace(/\s+/g, '');
  if (!cleanBase64 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleanBase64)) {
    throw new Error('Invalid "image" in AI refinement request: not valid base64 data.');
  }

  return cleanBase64;
}

export class GeminiRefineService {
  constructor(options = {}) {
    this.apiKey =
      typeof options.apiKey === 'string' && options.apiKey.trim()
        ? options.apiKey.trim()
        : null;
    this.authMode = options.authMode || null;
    this.project =
      options.project ||
      options.googleCloudProject ||
      options.projectId ||
      null;
    this.location =
      options.location ||
      options.googleCloudLocation ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      'global';
    this.model = options.model || process.env.MODEL || DEFAULT_MODEL;
    this.auth = options.auth || null;
    this.client = options.client || null;
    this.timeoutMs = options.timeoutMs ?? 90000;
  }

  async getClient() {
    if (this.client) {
      return this.client;
    }

    const rawKey =
      this.authMode === 'vertex-adc'
        ? ''
        : this.apiKey ||
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          '';
    const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';

    if (this.authMode === 'api-key' && !apiKey) {
      throw new Error(
        'Authentication failed: Gemini API key is required when authMode is "api-key" (set GEMINI_API_KEY or GOOGLE_API_KEY).'
      );
    }

    if (apiKey) {
      this.apiKey = apiKey;
      this.client = new GoogleGenAI({ apiKey });
      return this.client;
    }

    let authError = null;
    let project = String(
      this.project ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        ''
    ).trim();

    if (!project) {
      try {
        const auth = this.auth || new GoogleAuth();
        project = String((await auth.getProjectId()) || '').trim();
      } catch (err) {
        authError = err;
      }
    }

    if (!project) {
      const detail = authError?.message
        ? ` Underlying error: ${authError.message}`
        : ' No project ID was returned by Application Default Credentials.';
      throw new Error(
        'Authentication failed: Set GEMINI_API_KEY (Google AI Studio) or configure Vertex AI Application Default Credentials (ADC) with a Google Cloud Project ' +
          '(set via GOOGLE_CLOUD_PROJECT or `gcloud config set project <ID>`).' +
          detail
      );
    }

    this.project = project;
    const location = String(this.location || 'global').trim() || 'global';
    this.location = location;
    this.client = new GoogleGenAI({ vertexai: true, project, location });
    return this.client;
  }

  async refineImage({
    image,
    prompt = '',
    stylePreset = '',
    model,
    timeoutMs,
  } = {}) {
    const cleanBase64 = extractBase64Payload(image);

    if (typeof stylePreset !== 'string') {
      throw new Error('Invalid "stylePreset": must be a string.');
    }
    if (typeof prompt !== 'string') {
      throw new Error('Invalid "prompt": must be a string.');
    }

    const normalizedPreset = stylePreset.trim();
    const normalizedPrompt = prompt.trim();

    if (normalizedPrompt.length > 8000) {
      throw new Error('Invalid "prompt": exceeds maximum length of 8000 characters.');
    }

    if (
      normalizedPreset &&
      !Object.prototype.hasOwnProperty.call(STYLE_PRESETS, normalizedPreset)
    ) {
      throw new Error(
        `Invalid stylePreset "${stylePreset}". Valid style presets are: ${Object.keys(STYLE_PRESETS).join(', ')}`
      );
    }

    if (!normalizedPreset && !normalizedPrompt) {
      throw new Error(
        'Invalid refine request: either "stylePreset" or "prompt" is required.'
      );
    }

    const inputMimeType = detectImageMimeType(Buffer.from(cleanBase64, 'base64'));
    const rawModel = model ?? this.model ?? DEFAULT_MODEL;
    if (typeof rawModel !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(rawModel.trim())) {
      throw new Error(`Invalid model identifier "${String(rawModel)}".`);
    }

    const activeModel = rawModel.trim();
    const presetPrompt = normalizedPreset ? STYLE_PRESETS[normalizedPreset] : '';
    const finalPrompt =
      presetPrompt && normalizedPrompt
        ? `${presetPrompt}\n\nAdditional user instructions: ${normalizedPrompt}`
        : presetPrompt || normalizedPrompt;

    const effectiveTimeoutMs = timeoutMs ?? this.timeoutMs;
    const ai = await this.getClient();
    const abortController = new AbortController();
    let timeoutId = null;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error(`AI refine request timed out after ${effectiveTimeoutMs}ms.`));
      }, effectiveTimeoutMs);
    });

    let response;
    try {
      const generatePromise = ai.models.generateContent({
        model: activeModel,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: inputMimeType, data: cleanBase64 } },
              { text: finalPrompt },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          abortSignal: abortController.signal,
        },
      });
      response = await Promise.race([generatePromise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }

    const blockReason = response?.promptFeedback?.blockReason ?? null;
    const candidate = response?.candidates?.[0] ?? null;
    const finishReason = candidate?.finishReason ?? null;
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const imagePart = parts.find((p) => p?.inlineData?.data);
    const hasInvalidFinishReason =
      finishReason !== null && finishReason !== undefined && finishReason !== 'STOP';

    if (blockReason || !candidate || hasInvalidFinishReason || !imagePart) {
      throw new Error(
        `Gemini image refinement failed: model="${activeModel}", finishReason="${finishReason ?? 'NONE'}", blockReason="${blockReason ?? 'NONE'}"`
      );
    }

    return {
      image: imagePart.inlineData.data.replace(/\s+/g, ''),
      mimeType: imagePart.inlineData.mimeType?.trim() || 'image/png',
    };
  }
}
