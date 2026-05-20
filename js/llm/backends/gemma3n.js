/**
 * @module llm/backends/gemma3n
 * @description Gemma 3n E2B backend via MediaPipe LLM Tasks API (Tier 1).
 * Runs fully on-device using WebGPU. Requires ≥6 GB device memory.
 * Model file stored in Cache API after first download (see model-downloader.js).
 * CDN: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai
 */

import { buildTier1Prompt, parseTier1Response } from '../prompts.js';

const MEDIAPIPE_GENAI_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/wasm';
const MODEL_CACHE_PATH = '/models/gemma3n-e2b.litertlm';

// Loaded lazily; shared across calls within a session
let _llmInstance = null;

/** @returns {Promise<boolean>} */
export async function isAvailable() {
  // TODO: also check navigator.deviceMemory >= 6 in Phase 3
  return !!navigator.gpu;
}

/**
 * Initializes the LLM from the Cache API model file.
 * @param {Function} [progressCallback] - called with 0.0–1.0
 * @returns {Promise<void>}
 */
export async function loadModel(progressCallback) {
  // TODO: implement in Phase 3
  // const { FilesetResolver, LlmInference } = await import(
  //   `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/vision_bundle.js`
  // );
  // const genai = await FilesetResolver.forGenAiTasks(MEDIAPIPE_GENAI_CDN);
  // _llmInstance = await LlmInference.createFromOptions(genai, {
  //   baseOptions: { modelAssetPath: MODEL_CACHE_PATH },
  //   maxNumImages: 4,
  //   maxTokens: 512,
  // });
  progressCallback?.(0);
  console.log('[gemma3n] loadModel stub — not implemented');
}

/**
 * Analyze sunscreen coverage via Gemma 3n (on-device).
 * @param {string}                  faceImg    - base64 JPEG full face
 * @param {Record<string, string>}  crops      - { zoneId: base64JPEG }
 * @param {string[]}                zoneLabels
 * @returns {Promise<import('../prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  // TODO: implement in Phase 3
  // if (!_llmInstance) await loadModel();
  // const prompt = buildTier1Prompt(zoneLabels);
  // const images = [faceImg, ...Object.values(crops)].map(_toImageData);
  // const raw = await _llmInstance.generateResponse({ text: prompt, images });
  // return parseTier1Response(raw, zoneLabels) ?? _placeholder(zoneLabels);
  console.log('[gemma3n] analyze stub');
  return _placeholder(zoneLabels);
}

function _placeholder(zoneLabels) {
  return {
    overall: false,
    zones: zoneLabels.map((zone) => ({
      zone,
      covered: false,
      evidence: 'none',
      confidence: 0,
    })),
    notes: 'Placeholder — Gemma 3n backend not yet implemented.',
  };
}
