/**
 * @module analyzers/features
 * @description Per-zone feature extraction from 256×256 JPEG crops.
 * Converts sRGB pixels to CIE Lab (D65), then computes:
 *   - specular_score: mean of top-5% pixel brightness (0–1)
 *   - meanL / meanA / meanB: CIE Lab channel means
 *   - chroma: sqrt(a*² + b*²) — colorfulness
 *   - textureVar: local 8×8 block variance of L* (patchiness proxy)
 *
 * @typedef {Object} ZoneFeatures
 * @property {string} zoneId
 * @property {number} meanL       - CIE L*, 0–100
 * @property {number} meanA       - CIE a*, −128–127
 * @property {number} meanB       - CIE b*, −128–127
 * @property {number} chroma      - sqrt(a²+b²), 0–~180
 * @property {number} specular    - normalized 0–1 (top-5% brightness)
 * @property {number} textureVar  - normalized 0–1 (local L* block variance)
 */

/**
 * @param {string} cropDataUrl - base64 JPEG/PNG data URL (256×256)
 * @param {string} zoneId
 * @returns {Promise<ZoneFeatures>}
 */
export async function extractFeatures(cropDataUrl, zoneId) {
  const imgData = await _loadImageData(cropDataUrl);
  const { data, width, height } = imgData;
  const n = width * height;
  if (n === 0) return _zeros(zoneId);

  const Ls = new Float32Array(n);
  let sumL = 0, sumA = 0, sumB = 0;

  for (let i = 0; i < n; i++) {
    const { L, A, B } = _srgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    Ls[i] = L;
    sumL += L;
    sumA += A;
    sumB += B;
  }

  const meanL = sumL / n;
  const meanA = sumA / n;
  const meanB = sumB / n;
  const chroma = Math.sqrt(meanA * meanA + meanB * meanB);

  // Specular: mean of top 5% L* values, normalized to [0,1]
  const sorted = Ls.slice().sort((a, b) => a - b);
  const topStart = Math.floor(n * 0.95);
  let topSum = 0;
  for (let i = topStart; i < n; i++) topSum += sorted[i];
  const specular = ((topSum / Math.max(n - topStart, 1)) / 100);

  // Texture variance: mean of per-8×8-block L* variance, normalized
  const textureVar = _blockVariance(Ls, width, height, 8) / 625; // 625 = 25² practical max

  return { zoneId, meanL, meanA, meanB, chroma, specular, textureVar };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _zeros(zoneId) {
  return { zoneId, meanL: 0, meanA: 0, meanB: 0, chroma: 0, specular: 0, textureVar: 0 };
}

/** @returns {Promise<ImageData>} */
function _loadImageData(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** sRGB (0-255) → CIE Lab (D65 illuminant) */
function _srgbToLab(r, g, b) {
  // Linearise sRGB
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rl = lin(r), gl = lin(g), bl = lin(b);

  // Linear RGB → XYZ (D65)
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;

  // XYZ → Lab
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x / 0.95047);
  const fy = f(y / 1.00000);
  const fz = f(z / 1.08883);

  return { L: 116 * fy - 16, A: 500 * (fx - fy), B: 200 * (fy - fz) };
}

/**
 * Mean of per-block L* variance across a blockSize×blockSize grid.
 * Measures local luminance patchiness.
 */
function _blockVariance(Ls, width, height, blockSize) {
  const blockVars = [];
  for (let by = 0; by + blockSize <= height; by += blockSize) {
    for (let bx = 0; bx + blockSize <= width; bx += blockSize) {
      let s = 0, s2 = 0, count = 0;
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const v = Ls[(by + dy) * width + (bx + dx)];
          s += v; s2 += v * v; count++;
        }
      }
      const mean = s / count;
      blockVars.push(s2 / count - mean * mean);
    }
  }
  if (!blockVars.length) return 0;
  return blockVars.reduce((a, v) => a + v, 0) / blockVars.length;
}
