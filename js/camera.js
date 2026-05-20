/**
 * @module camera
 * @description Wraps getUserMedia for front/rear camera capture.
 * Provides stream lifecycle management and a single-frame capture method.
 */

/**
 * Starts the camera stream and binds it to a video element.
 * @param {HTMLVideoElement} videoEl
 * @param {'user'|'environment'} [facingMode='user']
 * @returns {Promise<MediaStream>}
 */
export async function startStream(videoEl, facingMode = 'user') {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  videoEl.srcObject = stream;
  await new Promise((resolve) => { videoEl.onloadedmetadata = resolve; });
  await videoEl.play();
  return stream;
}

/**
 * Stops all tracks on a video element's stream.
 * @param {HTMLVideoElement} videoEl
 */
export function stopStream(videoEl) {
  videoEl.srcObject?.getTracks().forEach((t) => t.stop());
  videoEl.srcObject = null;
}

/**
 * Captures the current video frame to an offscreen canvas and returns a base64 JPEG.
 * Uses its own internal canvas so the live overlay canvas is never clobbered.
 * @param {HTMLVideoElement} videoEl
 * @param {number} [quality=0.85]
 * @returns {string|null} base64 JPEG data URL, or null if video not ready
 */
export function captureFrame(videoEl, quality = 0.85) {
  if (videoEl.readyState < 2) return null;
  const canvas  = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Draws the current video frame onto an existing canvas element.
 * Used by coverage-analyzer to produce the source canvas for zone crops.
 * @param {HTMLVideoElement}  videoEl
 * @param {HTMLCanvasElement} canvasEl
 * @returns {boolean} true if frame was drawn
 */
export function drawFrameToCanvas(videoEl, canvasEl) {
  if (videoEl.readyState < 2) return false;
  canvasEl.width  = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  canvasEl.getContext('2d').drawImage(videoEl, 0, 0);
  return true;
}
