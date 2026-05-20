/**
 * @module model-downloader
 * @description Manages large model file downloads with streaming progress.
 * Uses the Cache API to store model blobs so they survive across sessions.
 * Transformers.js (SmolVLM) handles its own caching internally — this module
 * is used only for the Gemma 3N LiteRT file downloaded for MediaPipe.
 */

const MODEL_CACHE_NAME = 'suncoach-models-v1';

const MODEL_URLS = {
  'gemma3n-e2b': 'https://huggingface.co/google/gemma-3n-E2B-it-litert-preview/resolve/main/gemma3n-e2b.litertlm',
  'smolvlm-500m': 'https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct/resolve/main/onnx/model_q4.onnx',
};

/**
 * Downloads a model and stores it in the Cache API with streaming progress.
 * @param {string}   modelId
 * @param {Function} [progressCallback] - receives 0.0–1.0
 * @returns {Promise<void>}
 */
export async function downloadModel(modelId, progressCallback) {
  const url = MODEL_URLS[modelId];
  if (!url) throw new Error(`Unknown model id: ${modelId}`);

  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) { progressCallback?.(1.0); return; }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status} ${res.statusText}`);

  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) progressCallback?.(received / total);
  }

  const blob = new Blob(chunks);
  await cache.put(url, new Response(blob, {
    headers: { 'content-type': 'application/octet-stream' },
  }));
  progressCallback?.(1.0);
}

/**
 * Checks if a model is already cached.
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
export async function isModelCached(modelId) {
  const url = MODEL_URLS[modelId];
  if (!url) return false;
  const cache = await caches.open(MODEL_CACHE_NAME);
  return !!(await cache.match(url));
}

/**
 * Returns a blob: URL for the cached model so MediaPipe can load it locally.
 * Caller is responsible for revoking the URL when done.
 * @param {string} modelId
 * @returns {Promise<string|null>}
 */
export async function getModelBlobUrl(modelId) {
  const url = MODEL_URLS[modelId];
  if (!url) return null;
  const cache = await caches.open(MODEL_CACHE_NAME);
  const res = await cache.match(url);
  if (!res) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Removes a cached model to free storage.
 * @param {string} modelId
 * @returns {Promise<void>}
 */
export async function deleteModel(modelId) {
  const url = MODEL_URLS[modelId];
  if (!url) return;
  const cache = await caches.open(MODEL_CACHE_NAME);
  await cache.delete(url);
}

/** @returns {Record<string, string>} */
export function getModelUrls() {
  return { ...MODEL_URLS };
}
