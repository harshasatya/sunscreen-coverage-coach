/**
 * @module llm/backends/smolvlm
 * @description SmolVLM-500M backend via Transformers.js (Tier 2).
 * Loaded from CDN — no build step needed.
 * Uses WebGPU when available, single-threaded WASM otherwise.
 * Transformers.js handles its own model caching via the browser Cache API.
 */

import { buildTier2Prompt, parseTier2Response } from '../prompts.js';

const MODEL_ID = 'HuggingFaceTB/SmolVLM-500M-Instruct';
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js';

let _tf = null;
let _processor = null;
let _model = null;

async function _getTF() {
  if (!_tf) _tf = await import(CDN);
  return _tf;
}

/** @returns {Promise<boolean>} */
export async function isAvailable() {
  return typeof WebAssembly !== 'undefined';
}

/**
 * Downloads and caches SmolVLM weights via Transformers.js.
 * @param {Function} [progressCallback] - called with 0.0–1.0
 * @returns {Promise<void>}
 */
export async function loadModel(progressCallback) {
  if (_processor && _model) { progressCallback?.(1.0); return; }

  const { AutoProcessor, AutoModelForVision2Seq } = await _getTF();
  const device = navigator.gpu ? 'webgpu' : 'wasm';
  const dtype = device === 'webgpu'
    ? { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4' }
    : 'q4';

  const onProgress = (p) => {
    if (p?.status === 'progress' && typeof p.progress === 'number') {
      progressCallback?.(p.progress / 100);
    }
  };

  [_processor, _model] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: onProgress }),
    AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: onProgress,
    }),
  ]);

  progressCallback?.(1.0);
}

/**
 * Analyze sunscreen coverage via SmolVLM.
 * @param {string}                  faceImg
 * @param {Record<string, string>}  crops
 * @param {string[]}                zoneLabels
 * @returns {Promise<import('../prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  if (!_processor || !_model) await loadModel(() => {});

  const { RawImage } = await _getTF();
  const b64List = [faceImg, ...Object.values(crops)];
  const images = await Promise.all(b64List.map((b64) => _toRawImage(RawImage, b64)));

  const prompt = buildTier2Prompt(zoneLabels);
  const messages = [{
    role: 'user',
    content: [
      ...images.map(() => ({ type: 'image' })),
      { type: 'text', text: prompt },
    ],
  }];

  const text = _processor.apply_chat_template(messages, {
    add_generation_prompt: true,
    tokenize: false,
  });
  const inputs = await _processor(text, images, { padding: true });

  const generatedIds = await _model.generate({
    ...inputs,
    max_new_tokens: 200,
    do_sample: false,
  });

  const trimmed = generatedIds.map(
    (ids, i) => ids.slice(inputs.input_ids[i].length)
  );
  const [output] = _processor.batch_decode(trimmed, { skip_special_tokens: true });

  return parseTier2Response(output, zoneLabels) ?? _placeholder(zoneLabels);
}

async function _toRawImage(RawImage, b64) {
  const dataUrl = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
  return RawImage.fromURL(dataUrl);
}

function _placeholder(zoneLabels) {
  return {
    overall: false,
    zones: zoneLabels.map((zone) => ({ zone, covered: false, evidence: 'none', confidence: 0 })),
    notes: 'SmolVLM inference failed.',
  };
}
