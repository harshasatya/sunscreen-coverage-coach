/**
 * @module analyzers/symmetry
 * @description Compares paired (left/right) zones to detect asymmetric coverage.
 * A well-applied sunscreen should look the same on both sides.
 * Large specular or luminance asymmetry implies one side was missed.
 *
 * asymmetry_score = 0.5·Δspec + 0.3·ΔL/100 + 0.2·Δchroma/MAX_CHROMA
 * If score > THRESHOLD: flag the lower-specular side as suspect.
 *
 * @typedef {Object} SymmetryResult
 * @property {string}              pairLabel      - e.g. 'left-ear-zone/right-ear-zone'
 * @property {string}              leftId
 * @property {string}              rightId
 * @property {number}              asymmetryScore - 0.0–1.0
 * @property {'left'|'right'|null} suspectSide   - lower-specular side when flagged
 * @property {number}              confidence     - 0.0–1.0
 */

const W_SPEC  = 0.5;
const W_L     = 0.3;
const W_CHR   = 0.2;
const THRESHOLD     = 0.25; // flag if score > this
const HIGH_CONF_THR = 0.50; // confidence saturates at this score
// Practical max chroma for skin tones (avoids over-scaling unusual values)
const MAX_CHROMA = 80;

/**
 * @param {import('./features.js').ZoneFeatures} leftFeatures
 * @param {import('./features.js').ZoneFeatures} rightFeatures
 * @param {string} leftId
 * @param {string} rightId
 * @returns {SymmetryResult}
 */
export function analyzeSymmetry(leftFeatures, rightFeatures, leftId, rightId) {
  const deltaSpec  = Math.abs(leftFeatures.specular - rightFeatures.specular);          // 0–1
  const deltaL     = Math.abs(leftFeatures.meanL    - rightFeatures.meanL)    / 100;    // 0–1
  const deltaChroma = Math.abs(leftFeatures.chroma  - rightFeatures.chroma)
                     / Math.max(Math.max(leftFeatures.chroma, rightFeatures.chroma), MAX_CHROMA); // 0–1

  const score = W_SPEC * deltaSpec + W_L * deltaL + W_CHR * deltaChroma;

  let suspectSide = null;
  if (score > THRESHOLD) {
    suspectSide = leftFeatures.specular < rightFeatures.specular ? 'left' : 'right';
  }

  const confidence = Math.min(score / HIGH_CONF_THR, 1.0);

  return {
    pairLabel: `${leftId}/${rightId}`,
    leftId,
    rightId,
    asymmetryScore: score,
    suspectSide,
    confidence,
  };
}
