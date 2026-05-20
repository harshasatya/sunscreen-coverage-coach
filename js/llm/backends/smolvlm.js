/**
 * @module llm/backends/smolvlm
 * @description SmolVLM-500M backend via Transformers.js (Tier 2).
 * Requires WebGPU or WASM with ≥3 GB device memory.
 * CDN: https://cdn.jsdelivr.net/npm/@huggingface/transformers
 *
 * NOTE (Phase 4): The WASM backend needs SharedArrayBuffer, which requires
 * Cross-Origin-Opener-Policy: same-origin + Cross-Origin-Embedder-Policy: require-corp
 * headers on the server. GitHub Pages supports this via _headers file.
 */

import { buildTier2Prompt, parseTier2Response } from '../prompts.js';

const MODEL_ID = 'HuggingFaceTB/SmolVLM-500M-Instruct';
// Loaded lazily on first analyze() call
let _pipeline = null;

/** @returns {Promise<boolean>} */
export async function isAvailable() {
  // SmolVLM requires at least a WASM-capable browser; WebGPU preferred
  // TODO: check navigator.deviceMemory >= 3 in Phase 4
  return typeof WebAssembly !== 'undefined';
}

/**
 * Downloads and caches SmolVLM weights via Transformers.js.
 * @param {Function} [progressCallback] - called with 0.0–1.0
 * @returns {Promise<void>}
 */
export async function loadModel(progressCallback) {
  // TODO: implement in Phase 4
  // const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers');
  // _pipeline = await pipeline('image-to-text', MODEL_ID, {
  //   device: navigator.gpu ? 'webgpu' : 'wasm',
  //   dtype: 'q4',
  //   progress_callback: (p) => progressCallback?.(p.progress / 100),
  // });
  progressCallback?.(0);
  console.log('[smolvlm] loadModel stub — not implemented');
}

/**
 * Analyze sunscreen coverage via SmolVLM.
 * @param {string}                  faceImg
 * @param {Record<string, string>}  crops
 * @param {string[]}                zoneLabels
 * @returns {Promise<import('../prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  // TODO: implement in Phase 4
  // if (!_pipeline) await loadModel();
  // const prompt = buildTier2Prompt(zoneLabels);
  // const images = [faceImg, ...Object.values(crops)];
  // const output = await _pipeline(images, { text_inputs: prompt, max_new_tokens: 256 });
  // return parseTier2Response(output[0].generated_text, zoneLabels) ?? _placeholder(zoneLabels);
  console.log('[smolvlm] analyze stub');
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
    notes: 'Placeholder — SmolVLM backend not yet implemented.',
  };
}
