/**
 * @module analyzers/uniformity
 * @description Detects coverage outlier zones by comparing each zone's
 * specular score to the session-wide mean.
 *
 * Zones with specular < μ − 1.5σ are flagged as outliers.
 * If the session mean itself is below LOW_APP_FLOOR, a global warning fires.
 *
 * Lip and eyelid zones are excluded (people rarely apply sunscreen there).
 *
 * @typedef {Object} UniformityResult
 * @property {number}   sessionMeanSpecular
 * @property {number}   sessionStdDev
 * @property {string[]} outlierZones        - zone ids below the threshold
 * @property {boolean}  lowOverallWarning   - true if mean < LOW_APP_FLOOR
 */

const EXCLUDED_ZONES = new Set([
  'upper-lip-center', 'lower-lip-center',
  'left-upper-lip', 'right-upper-lip',
  'left-lower-lip-corner', 'right-lower-lip-corner',
  'philtrum',
]);

const OUTLIER_SIGMA = 1.5;
const LOW_APP_FLOOR = 0.08; // normalized specular — below this = probably no sunscreen

/**
 * @param {import('./features.js').ZoneFeatures[]} allFeatures
 * @returns {UniformityResult}
 */
export function analyzeUniformity(allFeatures) {
  const coverage = allFeatures.filter((f) => !EXCLUDED_ZONES.has(f.zoneId));

  if (!coverage.length) {
    return { sessionMeanSpecular: 0, sessionStdDev: 0, outlierZones: [], lowOverallWarning: false };
  }

  const specs = coverage.map((f) => f.specular);
  const mean  = specs.reduce((a, b) => a + b, 0) / specs.length;
  const variance = specs.reduce((s, v) => s + (v - mean) ** 2, 0) / specs.length;
  const stdDev   = Math.sqrt(variance);

  const threshold    = mean - OUTLIER_SIGMA * stdDev;
  const outlierZones = coverage
    .filter((f) => f.specular < threshold)
    .map((f) => f.zoneId);

  return {
    sessionMeanSpecular: mean,
    sessionStdDev:       stdDev,
    outlierZones,
    lowOverallWarning:   mean < LOW_APP_FLOOR,
  };
}
