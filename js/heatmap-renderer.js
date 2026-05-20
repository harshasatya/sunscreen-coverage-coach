/**
 * @module heatmap-renderer
 * @description Renders a coverage heatmap onto a canvas by drawing filled
 * landmark-bounded polygons per zone. Also draws the face image as background.
 * Colors: green = covered, orange = partial, red = missed, grey = no data.
 */

export const COVERAGE_COLORS = {
  covered:  { fill: 'rgba(46,  204, 113, 0.38)', stroke: 'rgba(46,  204, 113, 0.75)' },
  partial:  { fill: 'rgba(243, 156,  18, 0.38)', stroke: 'rgba(243, 156,  18, 0.75)' },
  missed:   { fill: 'rgba(231,  76,  60, 0.38)', stroke: 'rgba(231,  76,  60, 0.75)' },
  unknown:  { fill: 'rgba(150, 150, 150, 0.20)', stroke: 'rgba(150, 150, 150, 0.40)' },
};

/**
 * Renders the full heatmap — face image background + zone overlays.
 * @param {HTMLCanvasElement}   canvasEl
 * @param {{x:number,y:number,z:number}[]} landmarks - 478-point normalized array
 * @param {Array<{zone:string,status:string,confidence:number}>} zoneScores
 * @param {object[]}            zones       - zone objects from zones.json
 * @param {string|null}         [imageDataUrl] - captured face image as background
 */
export async function renderHeatmap(canvasEl, landmarks, zoneScores, zones, imageDataUrl) {
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // Draw face image as background if provided
  if (imageDataUrl) {
    await _drawBackground(ctx, imageDataUrl, canvasEl.width, canvasEl.height);
  }

  if (!landmarks?.length) return;

  const scoreMap = {};
  for (const s of (zoneScores ?? [])) scoreMap[s.zone] = s;

  const w = canvasEl.width;
  const h = canvasEl.height;

  for (const zone of zones) {
    if (!zone.landmark_indices?.length) continue;

    const pts = zone.landmark_indices
      .map((i) => landmarks[i])
      .filter(Boolean);
    if (pts.length < 3) continue;

    const score  = scoreMap[zone.id];
    const colors = score
      ? (COVERAGE_COLORS[score.status] ?? COVERAGE_COLORS.unknown)
      : COVERAGE_COLORS.unknown;

    ctx.beginPath();
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * w, pts[i].y * h);
    }
    ctx.closePath();

    ctx.fillStyle   = colors.fill;
    ctx.fill();
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Label missed zones with a small dot at centroid
  for (const zone of zones) {
    const score = scoreMap[zone.id];
    if (!score || score.status === 'covered') continue;
    if (!zone.landmark_indices?.length) continue;

    const pts = zone.landmark_indices.map((i) => landmarks[i]).filter(Boolean);
    if (!pts.length) continue;

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * w;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * h;

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = score.status === 'missed' ? 'rgba(231,76,60,0.9)' : 'rgba(243,156,18,0.9)';
    ctx.fill();
  }
}

/**
 * Clears the canvas.
 * @param {HTMLCanvasElement} canvasEl
 */
export function clearHeatmap(canvasEl) {
  canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _drawBackground(ctx, dataUrl, w, h) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Maintain aspect ratio, center-crop to fill canvas
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw    = img.naturalWidth  * scale;
      const sh    = img.naturalHeight * scale;
      ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
      // Dim slightly so overlays are visible
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, w, h);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}
