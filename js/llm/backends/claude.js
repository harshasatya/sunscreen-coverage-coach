/**
 * @module llm/backends/claude
 * @description Claude API backend (cloud fallback, Tier 3).
 * Model: claude-sonnet-4-6
 * Sends full-face image + up to 3 suspect-zone crops in a single messages API call.
 * API key sourced from Settings.claudeApiKey (localStorage via storage.js).
 * Clearly disclosed to user in Settings: images are sent to Anthropic servers.
 */

import { buildTier3Prompt, parseTier3Response } from '../prompts.js';
import { getSettings } from '../../storage.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-sonnet-4-6';

/** @returns {Promise<boolean>} */
export async function isAvailable() {
  const { claudeApiKey } = getSettings();
  return !!claudeApiKey;
}

/**
 * No model download needed for cloud tier.
 * @param {Function} [progressCallback]
 * @returns {Promise<void>}
 */
export async function loadModel(progressCallback) {
  progressCallback?.(1.0);
}

/**
 * Analyze sunscreen coverage via Claude API.
 * @param {string}                    faceImg    - base64 JPEG of full face (512×512)
 * @param {Record<string, string>}    crops      - { zoneId: base64JPEG } for up to 3 zones
 * @param {string[]}                  zoneLabels - display names matching crops order
 * @returns {Promise<import('../prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  const { claudeApiKey } = getSettings();
  if (!claudeApiKey) {
    console.warn('[claude] No API key set; returning placeholder response');
    return _placeholder(zoneLabels);
  }

  const prompt = buildTier3Prompt(zoneLabels);

  // Build multimodal content: full face + crops
  const imageContents = [faceImg, ...Object.values(crops)].map((b64) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: _stripDataPrefix(b64),
    },
  }));

  const body = {
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContents,
          { type: 'text', text: prompt },
        ],
      },
    ],
  };

  // TODO: add retry logic + error surfacing in Phase 4
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`[claude] API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawText = data?.content?.[0]?.text ?? '';
  const parsed = parseTier3Response(rawText, zoneLabels);

  if (!parsed) {
    console.warn('[claude] Failed to parse response; falling back to placeholder', rawText);
    return _placeholder(zoneLabels);
  }

  return parsed;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _placeholder(zoneLabels) {
  return {
    overall: false,
    zones: zoneLabels.map((zone) => ({
      zone,
      covered: false,
      evidence: 'none',
      confidence: 0,
    })),
    notes: 'Placeholder — Claude backend not yet connected.',
  };
}

function _stripDataPrefix(b64) {
  return b64.replace(/^data:image\/\w+;base64,/, '');
}
