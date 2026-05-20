/**
 * @module model-downloader
 * @description Manages large model file downloads with streaming progress.
 * Uses the Cache API to store model blobs so they survive across sessions.
 * Shows a progress bar in a modal during download (rendered by onboarding.js).
 */

const MODEL_CACHE_NAME = 'suncoach-models-v1';

const MODEL_URLS = {
  'gemma3n-e2b': 'https://huggingface.co/google/gemma-3n-E2B-it-litert-preview/resolve/main/gemma3n-e2b.litertlm',
  'smolvlm-500m': 'https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct/resolve/main/onnx/model_q4.onnx',
};

/**
 * Downloads a model and stores it in the Cache API.
 * @param {string}   modelId          - key from MODEL_URLS
 * @param {Function} [progressCallback] - receives 0.0–1.0
 * @returns {Promise<void>}
 */
export async function downloadModel(modelId, progressCallback) {
  // TODO: implement in Phase 3 / 4
  // const url = MODEL_URLS[modelId];
  // const cache = await caches.open(MODEL_CACHE_NAME);
  // const cached = await cache.match(url);
  // if (cached) { progressCallback?.(1.0); return; }
  // const res = await fetch(url);
  // const total = Number(res.headers.get('content-length') ?? 0);
  // const reader = res.body.getReader();
  // const chunks = []; let received = 0;
  // while (true) {
  //   const { done, value } = await reader.read();
  //   if (done) break;
  //   chunks.push(value); received += value.length;
  //   progressCallback?.(total ? received / total : 0);
  // }
  // const blob = new Blob(chunks);
  // await cache.put(url, new Response(blob));
  progressCallback?.(0);
  console.log('[model-downloader] downloadModel stub', modelId);
}

/**
 * Checks if a model is already cached.
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
export async function isModelCached(modelId) {
  // TODO: implement in Phase 3
  return false;
}

/**
 * Removes a cached model to free storage.
 * @param {string} modelId
 * @returns {Promise<void>}
 */
export async function deleteModel(modelId) {
  // TODO: implement in Phase 3
  console.log('[model-downloader] deleteModel stub', modelId);
}

/** @returns {Record<string, string>} */
export function getModelUrls() {
  return { ...MODEL_URLS };
}
