/**
 * @module face-mesh
 * @description Live FaceLandmarker detection loop, mesh overlay renderer,
 * and zone crop extraction utilities.
 * All landmark coordinates are normalized [0, 1] relative to image dimensions.
 */

import { getFaceLandmarker } from './mediapipe-loader.js';
import { getZone } from './zones.js';

// ─── MediaPipe face oval indices (stable across 478-point model versions) ────
// Forms a closed polyline around the face boundary.
const FACE_OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

// Eye contours for a richer overlay
const LEFT_EYE_IDX  = [263, 249, 390, 373, 374, 380, 381, 382, 362,
                        398, 384, 385, 386, 387, 388, 466];
const RIGHT_EYE_IDX = [33, 7, 163, 144, 145, 153, 154, 155, 133,
                        173, 157, 158, 159, 160, 161, 246];
// Outer lips
const LIPS_IDX      = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409,
                        291, 375, 321, 405, 314, 17, 84, 181, 91, 146];

// ─── Module state ─────────────────────────────────────────────────────────────
let _lastResult = null;
let _rafId      = null;
let _running    = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts the live detection + overlay loop.
 * Loads FaceLandmarker on first call (async, ~2 s cold).
 * @param {HTMLVideoElement}  videoEl
 * @param {HTMLCanvasElement} overlayCanvas
 * @returns {function} stopDetection — call to cancel the loop
 */
export function startLiveDetection(videoEl, overlayCanvas) {
  _running = true;
  let landmarker = null;

  // Load in background; loop runs immediately and starts drawing once ready
  getFaceLandmarker().then((lm) => { landmarker = lm; });

  function loop() {
    if (!_running) return;

    if (landmarker && videoEl.readyState >= 2) {
      try {
        _lastResult = landmarker.detectForVideo(videoEl, performance.now());
        const pts = _lastResult?.faceLandmarks?.[0];
        if (pts?.length) {
          _drawOverlay(overlayCanvas, pts);
        } else {
          _clearCanvas(overlayCanvas);
        }
      } catch {
        // Detection can fail transiently on orientation change etc.
      }
    }

    _rafId = requestAnimationFrame(loop);
  }

  _rafId = requestAnimationFrame(loop);

  return () => {
    _running = false;
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    _clearCanvas(overlayCanvas);
  };
}

/**
 * Returns the most recent FaceLandmarkerResult from the live loop.
 * @returns {object|null}
 */
export function getLastResult() {
  return _lastResult;
}

/**
 * Converts a FaceLandmarkerResult to a plain array of {x, y, z} objects.
 * @param {object|null} result
 * @returns {{x:number, y:number, z:number}[]}
 */
export function landmarksToNormalized(result) {
  return result?.faceLandmarks?.[0] ?? [];
}

/**
 * Extracts a 256×256 JPEG crop around the bounding box of a zone's landmark polygon.
 * @param {HTMLCanvasElement} sourceCanvas  — full-resolution captured frame
 * @param {string}            zoneId
 * @param {{x:number, y:number, z:number}[]} landmarks — normalized coords
 * @returns {string|null} base64 JPEG data URL, or null if zone has no landmarks
 */
export function extractZoneCrop(sourceCanvas, zoneId, landmarks) {
  const zone = getZone(zoneId);
  if (!zone || !zone.landmark_indices?.length || !landmarks?.length) return null;

  const cw = sourceCanvas.width;
  const ch = sourceCanvas.height;

  const pts = zone.landmark_indices
    .map((i) => landmarks[i])
    .filter(Boolean);
  if (pts.length < 2) return null;

  const xs  = pts.map((p) => p.x * cw);
  const ys  = pts.map((p) => p.y * ch);
  const PAD = Math.round(Math.min(cw, ch) * 0.03); // 3% padding
  const x1  = Math.max(0,  Math.min(...xs) - PAD);
  const y1  = Math.max(0,  Math.min(...ys) - PAD);
  const x2  = Math.min(cw, Math.max(...xs) + PAD);
  const y2  = Math.min(ch, Math.max(...ys) + PAD);
  const w   = x2 - x1;
  const h   = y2 - y1;
  if (w < 8 || h < 8) return null;

  const out = document.createElement('canvas');
  out.width  = 256;
  out.height = 256;
  out.getContext('2d').drawImage(sourceCanvas, x1, y1, w, h, 0, 0, 256, 256);
  return out.toDataURL('image/jpeg', 0.85);
}

/**
 * Returns the centroid of a zone's landmark polygon in normalized [0,1] coords.
 * @param {string} zoneId
 * @param {{x:number, y:number, z:number}[]} landmarks
 * @returns {{x:number, y:number}|null}
 */
export function getZoneCentroid(zoneId, landmarks) {
  const zone = getZone(zoneId);
  if (!zone || !zone.landmark_indices?.length || !landmarks?.length) return null;

  const pts = zone.landmark_indices.map((i) => landmarks[i]).filter(Boolean);
  if (!pts.length) return null;

  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function _drawOverlay(canvas, pts) {
  const ctx = canvas.getContext('2d');
  const w   = canvas.width;
  const h   = canvas.height;
  ctx.clearRect(0, 0, w, h);

  _drawPolyline(ctx, pts, FACE_OVAL_IDX,  w, h, 'rgba(50,220,120,0.9)',  2,   true);
  _drawPolyline(ctx, pts, LEFT_EYE_IDX,   w, h, 'rgba(80,200,255,0.75)', 1.5, true);
  _drawPolyline(ctx, pts, RIGHT_EYE_IDX,  w, h, 'rgba(80,200,255,0.75)', 1.5, true);
  _drawPolyline(ctx, pts, LIPS_IDX,       w, h, 'rgba(255,140,80,0.65)', 1.5, true);
}

function _drawPolyline(ctx, pts, indices, w, h, color, lineWidth, close) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.lineJoin    = 'round';

  let first = true;
  for (const idx of indices) {
    const p = pts[idx];
    if (!p) continue;
    if (first) { ctx.moveTo(p.x * w, p.y * h); first = false; }
    else        { ctx.lineTo(p.x * w, p.y * h); }
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

function _clearCanvas(canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
