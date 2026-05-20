/**
 * @module llm/backends/gemma3n
 * @description Gemma 3n E2B backend via MediaPipe LLM Tasks API (Tier 1).
 * Runs fully on-device using WebGPU. Requires ≥6 GB device memory.
 * Model (~2.9 GB) is downloaded once and stored in the Cache API via
 * model-downloader.js. Subsequent loads are served from cache.
 */

import { buildTier1Prompt, parseTier1Response } from '../prompts.js';
import { downloadModel, isModelCached, getModelBlobUrl, getModelUrls } from '../../model-downloader.js';

const GENAI_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/genai_bundle.mjs';
const WASM_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm';
const MODEL_ID  = 'gemma3n-e2b';

let _llm = null;
let _blobUrl = null;

/** @returns {Promise<boolean>} */
export async function isAvailable() {
  return !!navigator.gpu && (navigator.deviceMemory ?? 4) >= 6;
}

/**
 * Downloads the model if needed, then initializes MediaPipe LlmInference.
 * @param {Function} [progressCallback] - called with 0.0–1.0
 * @returns {Promise<void>}
 */
export async function loadModel(progressCallback) {
  if (_llm) { progressCallback?.(1.0); return; }

  // Download phase: 0–90%
  if (!await isModelCached(MODEL_ID)) {
    await downloadModel(MODEL_ID, (p) => progressCallback?.(p * 0.9));
  }
  progressCallback?.(0.92);

  // Init MediaPipe runtime: 92–100%
  const { FilesetResolver, LlmInference } = await import(GENAI_CDN);
  const genai = await FilesetResolver.forGenAiTasks(WASM_CDN);
  progressCallback?.(0.95);

  // Load from cache as blob URL; fall back to direct HuggingFace URL
  _blobUrl = await getModelBlobUrl(MODEL_ID);
  const modelAssetPath = _blobUrl ?? getModelUrls()[MODEL_ID];

  _llm = await LlmInference.createFromOptions(genai, {
    baseOptions: { modelAssetPath },
    maxNumImages: 4,
    maxTokens: 512,
    topK: 40,
    temperature: 0.1,
  });

  progressCallback?.(1.0);
}

/**
 * Analyze sunscreen coverage via Gemma 3n (on-device).
 * @param {string}                  faceImg    - base64 JPEG full face
 * @param {Record<string, string>}  crops      - { zoneId: base64JPEG }
 * @param {string[]}                zoneLabels
 * @returns {Promise<import('../prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  if (!_llm) await loadModel(() => {});

  const prompt = buildTier1Prompt(zoneLabels);
  const images = [faceImg, ...Object.values(crops)];

  try {
    const raw = await _llm.generateResponse({ text: prompt, images });
    return parseTier1Response(raw, zoneLabels) ?? _placeholder(zoneLabels);
  } catch (err) {
    console.warn('[gemma3n] generateResponse failed:', err.message);
    return _placeholder(zoneLabels);
  }
}

function _placeholder(zoneLabels) {
  return {
    overall: false,
    zones: zoneLabels.map((zone) => ({ zone, covered: false, evidence: 'none', confidence: 0 })),
    notes: 'Gemma 3n inference failed.',
  };
}
