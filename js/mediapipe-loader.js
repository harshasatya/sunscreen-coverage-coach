/**
 * @module mediapipe-loader
 * @description Lazy-loads MediaPipe FaceLandmarker from CDN on first use.
 * Caches the loaded instance module-locally so subsequent calls are instant.
 * Falls back from GPU to CPU delegate if GPU initialization fails.
 */

const VISION_BUNDLE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';

export const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let _faceLandmarker  = null;
let _loadPromise     = null;

// Exported so face-mesh.js can access connection constants for drawing
export let FaceLandmarkerClass = null;

/**
 * Returns the shared FaceLandmarker instance, loading it on first call.
 * @returns {Promise<object|null>}
 */
export async function getFaceLandmarker() {
  if (_faceLandmarker) return _faceLandmarker;
  if (_loadPromise)    return _loadPromise;

  _loadPromise = _load().catch((err) => {
    console.error('[mediapipe-loader] Load failed:', err);
    _loadPromise = null;
    return null;
  });

  return _loadPromise;
}

async function _load() {
  const { FaceLandmarker, FilesetResolver } = await import(VISION_BUNDLE_CDN);
  FaceLandmarkerClass = FaceLandmarker;

  const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

  const opts = {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate: 'GPU',
    },
    outputFaceBlendshapes: false,
    runningMode: 'VIDEO',
    numFaces: 1,
  };

  try {
    _faceLandmarker = await FaceLandmarker.createFromOptions(vision, opts);
  } catch (gpuErr) {
    console.warn('[mediapipe-loader] GPU init failed, falling back to CPU:', gpuErr);
    _faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...opts,
      baseOptions: { ...opts.baseOptions, delegate: 'CPU' },
    });
  }

  return _faceLandmarker;
}
