/**
 * @module llm/backends/smolvlm
 * @description SmolVLM-500M backend via Transformers.js (Tier 2).
 * Loaded from CDN — no build step needed.
 * Uses WebGPU when available, single-threaded WASM otherwise.
 * Transformers.js manages its own model caching via the browser Cache API.
 */

import { buildTier2Prompt, parseTier2Response } from '../prompts.js';

const MODEL_ID = 'HuggingFaceTB/SmolVLM-500M-Instruct';
// Use the non-minified ESM bundle — more reliably served as a module by jsDelivr
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.js';

let _tf        = null;
let _processor = null;
let _model     = null;

async function _getTF() {
  if (_tf) return _tf;
  console.log('[smolvlm] Importing Transformers.js from CDN…');
  try {
    _tf = await import(CDN);
    console.log('[smolvlm] Transformers.js loaded, exports:', Object.keys(_tf).slice(0, 8));
  } catch (err) {
    console.error('[smolvlm] CDN import failed:', err);
    throw new Error(`Transformers.js CDN import failed: ${err.message}`);
  }
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
  if (_processor && _model) {
    console.log('[smolvlm] Model already in memory');
    progressCallback?.(1.0);
    return;
  }

  const { AutoProcessor, AutoModelForVision2Seq } = await _getTF();

  const device = navigator.gpu ? 'webgpu' : 'wasm';
  const dtype  = device === 'webgpu'
    ? { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4' }
    : 'q4';

  console.log(`[smolvlm] Loading model — device: ${device}, dtype: ${JSON.stringify(dtype)}`);

  // Track how many files have started vs finished to smooth overall progress
  let totalFiles = 0;
  let doneFiles  = 0;
  let lastFilePct = 0;

  const onProgress = (p) => {
    if (p?.status === 'initiate') {
      totalFiles++;
      console.log('[smolvlm] Starting file:', p.file);
    } else if (p?.status === 'done') {
      doneFiles++;
      console.log('[smolvlm] Done file:', p.file);
    } else if (p?.status === 'progress' && typeof p.progress === 'number') {
      lastFilePct = p.progress / 100;
      // Blend per-file progress with overall file completion
      const overall = totalFiles > 0
        ? (doneFiles + lastFilePct) / Math.max(totalFiles, 4)
        : lastFilePct;
      progressCallback?.(Math.min(overall, 0.99));
    }
  };

  try {
    console.log('[smolvlm] Fetching processor…');
    _processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    });
    console.log('[smolvlm] Processor ready');

    console.log('[smolvlm] Fetching model weights (~500 MB)…');
    _model = await AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: onProgress,
    });
    console.log('[smolvlm] Model ready');

    progressCallback?.(1.0);
  } catch (err) {
    console.error('[smolvlm] Model load failed:', err);
    // Reset so next call can retry
    _processor = null;
    _model     = null;
    throw err;
  }
}

/**
 * Analyze sunscreen coverage via SmolVLM.
 * @param {string}                  faceImg
 * @param {Record<string, string>}  crops
 * @param {string[]}                zoneLabels
 * @returns {Promise<import('../prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  if (!_processor || !_model) {
    try {
      await loadModel(() => {});
    } catch (err) {
      console.error('[smolvlm] Cannot analyze — model unavailable:', err);
      return _placeholder(zoneLabels);
    }
  }

  const { RawImage } = await _getTF();

  // Convert base64 images → RawImage
  let images;
  try {
    const b64List = [faceImg, ...Object.values(crops)];
    images = await Promise.all(b64List.map((b64) => _toRawImage(RawImage, b64)));
  } catch (err) {
    console.error('[smolvlm] Image conversion failed:', err);
    return _placeholder(zoneLabels);
  }

  // Build chat-template input
  let inputs;
  try {
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
    inputs = await _processor(text, images, { padding: true });
  } catch (err) {
    console.error('[smolvlm] Preprocessing failed:', err);
    return _placeholder(zoneLabels);
  }

  // Run generation
  let generatedIds;
  try {
    generatedIds = await _model.generate({
      ...inputs,
      max_new_tokens: 200,
      do_sample: false,
    });
  } catch (err) {
    console.error('[smolvlm] Generation failed:', err);
    return _placeholder(zoneLabels);
  }

  // Decode — slice off the input tokens first
  try {
    const inputLen = inputs.input_ids.dims[1];
    // tolist() safely converts the 2D Tensor to a nested JS array
    const idsList = generatedIds.tolist();
    const newTokensList = idsList.map((row) =>
      row.slice(inputLen).map((id) => (typeof id === 'bigint' ? Number(id) : id))
    );
    const [output] = _processor.batch_decode(newTokensList, { skip_special_tokens: true });
    console.log('[smolvlm] Raw output:', output);
    return parseTier2Response(output, zoneLabels) ?? _placeholder(zoneLabels);
  } catch (err) {
    console.error('[smolvlm] Decoding failed:', err);
    return _placeholder(zoneLabels);
  }
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
