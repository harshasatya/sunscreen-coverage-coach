/**
 * @module analyzers/differential
 * @description Precise Mode only: compares a baseline (pre-application) frame
 * against an applied frame to detect newly covered areas. This catches
 * uniformly-thin application that Quick Mode cannot see in a single capture.
 *
 * @typedef {Object} DifferentialResult
 * @property {string}   zoneId
 * @property {number}   deltaSpecular   - applied − baseline specular
 * @property {number}   deltaL          - applied − baseline luminance
 * @property {number}   deltaChroma     - applied − baseline chroma
 * @property {boolean}  newCoverageDetected
 */

/**
 * Computes per-zone feature delta between baseline and applied images.
 * @param {import('./features.js').ZoneFeatures} baselineFeatures
 * @param {import('./features.js').ZoneFeatures} appliedFeatures
 * @returns {DifferentialResult}
 */
const NEW_COVERAGE_SPECULAR_MIN = 0.10; // applied specular must exceed this
const NEW_COVERAGE_DELTA_MIN    = 0.04; // delta must exceed this

export function analyzeDifferential(baselineFeatures, appliedFeatures) {
  const deltaSpecular = appliedFeatures.specular - baselineFeatures.specular;
  const deltaL        = appliedFeatures.meanL    - baselineFeatures.meanL;
  const deltaChroma   = appliedFeatures.chroma   - baselineFeatures.chroma;

  // New coverage: meaningful specular increase AND applied zone looks bright enough
  // Mineral sunscreen also raises L* (whitening effect); chemical raises specular without L*
  const newCoverageDetected =
    deltaSpecular >= NEW_COVERAGE_DELTA_MIN &&
    appliedFeatures.specular >= NEW_COVERAGE_SPECULAR_MIN;

  return {
    zoneId: appliedFeatures.zoneId,
    deltaSpecular,
    deltaL,
    deltaChroma,
    newCoverageDetected,
  };
}
