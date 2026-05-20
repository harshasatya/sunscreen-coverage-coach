/**
 * @module coverage-analyzer
 * @description Orchestrates the Quick Mode + Precise Mode analysis pipeline:
 *   Phase 1: capture frame + get landmarks → save session
 *   Phase 2: zone crops → features → symmetry + uniformity → zone scores
 *   Phase 3: VLM call on top-3 suspects → merge evidence
 *
 * @typedef {Object} ZoneScore
 * @property {string}   zone
 * @property {string}   status      - 'covered' | 'partial' | 'missed'
 * @property {number}   confidence  - 0.0–1.0
 * @property {string[]} evidence
 *
 * @typedef {Object} AnalysisResult
 * @property {string}        sessionId
 * @property {number}        timestamp
 * @property {ZoneScore[]}   zones
 * @property {boolean}       overallApplicationDetected
 * @property {number}        overallConfidence
 * @property {boolean}       lowOverallWarning
 * @property {string|null}   vlmNotes
 * @property {string}        vlmTierUsed
 * @property {string|null}   imageDataUrl
 * @property {{x:number,y:number,z:number}[]} landmarks
 */

import { captureFrame }                                          from './camera.js';
import { getLastResult, landmarksToNormalized, extractZoneCrop } from './face-mesh.js';
import { loadZones, getAllZones, getPairs, getZone }             from './zones.js';
import { extractFeatures }                                       from './analyzers/features.js';
import { analyzeSymmetry }                                       from './analyzers/symmetry.js';
import { analyzeUniformity }                                     from './analyzers/uniformity.js';
import { analyzeDifferential }                                   from './analyzers/differential.js';
import { saveSession, generateId, getSettings }                  from './storage.js';
import * as runtime                                              from './llm/runtime.js';

const LOW_APP_FLOOR = 0.08;

/**
 * Quick Mode: single capture, heuristics + optional VLM.
 * @param {HTMLVideoElement} videoEl
 * @param {object}           [options]
 * @param {string}           [options.skinTone]
 * @param {string}           [options.sunscreenType]
 * @param {string|null}      [options.baselineDataUrl]  - Precise Mode baseline image
 * @param {{x:number,y:number,z:number}[]} [options.baselineLandmarks]
 * @returns {Promise<AnalysisResult>}
 */
export async function analyze(videoEl, options = {}) {
  await loadZones();

  const settings      = getSettings();
  const skinTone      = options.skinTone      ?? settings.skinTone      ?? 'III';
  const sunscreenType = options.sunscreenType ?? settings.sunscreenType ?? 'mineral';
  const vlmTierUsed   = await runtime.getActiveTier();

  // ── Phase 1: capture + landmarks ─────────────────────────────────────────
  const imageDataUrl = captureFrame(videoEl);
  if (!imageDataUrl) throw new Error('Camera not ready — cannot capture frame.');

  const landmarks = landmarksToNormalized(getLastResult());
  const hasFace   = landmarks.length > 0;

  // ── Phase 2: crop extraction + features ──────────────────────────────────
  const allFeatures = [];
  const featureMap  = {};
  const cropMap     = {}; // kept for VLM phase

  if (hasFace) {
    const srcCanvas = await _imageToCanvas(imageDataUrl);
    await Promise.all(getAllZones().map(async (zone) => {
      const crop = extractZoneCrop(srcCanvas, zone.id, landmarks);
      if (!crop) return;
      cropMap[zone.id] = crop;
      const feat = await extractFeatures(crop, zone.id);
      allFeatures.push(feat);
      featureMap[zone.id] = feat;
    }));
  }

  // ── Phase 2: symmetry + uniformity ───────────────────────────────────────
  const symmetryResults = [];
  for (const [leftId, rightId] of getPairs()) {
    const lf = featureMap[leftId], rf = featureMap[rightId];
    if (lf && rf) symmetryResults.push(analyzeSymmetry(lf, rf, leftId, rightId));
  }
  const uniformity = analyzeUniformity(allFeatures);

  // ── Precise Mode: differential analysis ──────────────────────────────────
  let differentialScores = null;
  if (options.baselineDataUrl && options.baselineLandmarks?.length && hasFace) {
    differentialScores = await _runDifferential(
      options.baselineDataUrl, options.baselineLandmarks,
      imageDataUrl, landmarks
    );
  }

  // ── Merge heuristic zone scores ───────────────────────────────────────────
  let zoneScores = _mergeScores(
    getAllZones(), featureMap, symmetryResults, uniformity,
    differentialScores, sunscreenType, skinTone
  );

  // ── Phase 3: VLM on top-3 suspects ───────────────────────────────────────
  let vlmRawResponse = null;
  let vlmNotes = null;
  let vlmFailed = false;

  if (hasFace && vlmTierUsed !== 'heuristics') {
    const suspects      = topSuspectZones(zoneScores, 3);
    const suspectCrops  = {};
    const suspectLabels = [];
    for (const zoneId of suspects) {
      const zone = getZone(zoneId);
      if (zone && cropMap[zoneId]) {
        suspectCrops[zoneId] = cropMap[zoneId];
        suspectLabels.push(zone.label);
      }
    }

    if (suspectLabels.length) {
      try {
        const vlmResult = await runtime.analyze(imageDataUrl, suspectCrops, suspectLabels);
        vlmRawResponse = JSON.stringify(vlmResult);
        vlmNotes = vlmResult.notes || null;
        _mergeVLMEvidence(zoneScores, suspects, vlmResult);

        // VLM override: if no overall application detected, upgrade warning
        if (!vlmResult.overall && !uniformity.lowOverallWarning) {
          uniformity.lowOverallWarning = true;
        }
      } catch (err) {
        console.warn('[coverage-analyzer] VLM call failed, heuristics only:', err.message);
        vlmFailed = true;
      }
    }
  }

  // ── Save session ──────────────────────────────────────────────────────────
  const sessionId    = generateId();
  const zoneScoreMap = Object.fromEntries(zoneScores.map((z) => [z.zone, z]));
  await saveSession({
    id: sessionId, timestamp: Date.now(), mode: options.baselineDataUrl ? 'precise' : 'quick',
    imageDataUrl, baselineDataUrl: options.baselineDataUrl ?? null,
    landmarks, zoneScores: zoneScoreMap,
    vlmTierUsed, vlmRawResponse, vlmNotes, uvIndex: null, reapplyAt: null,
  });

  // Compose result notes
  const missed = zoneScores.filter((z) => z.status === 'missed');
  const notes  = vlmNotes
    ?? (!hasFace
      ? 'No face detected — position face in frame and retry.'
      : uniformity.lowOverallWarning
      ? 'Very low application — consider reapplying fully.'
      : missed.length
      ? `Likely missed: ${missed.slice(0, 3).map((z) => z.zone).join(', ')}${missed.length > 3 ? '…' : ''}.`
      : 'Coverage looks complete — no obvious gaps detected.')
    + (vlmFailed ? ' (AI analysis unavailable — heuristics only.)' : '');

  return {
    sessionId, timestamp: Date.now(), zones: zoneScores,
    overallApplicationDetected: uniformity.sessionMeanSpecular > LOW_APP_FLOOR,
    overallConfidence: uniformity.sessionMeanSpecular,
    lowOverallWarning: uniformity.lowOverallWarning,
    vlmNotes: notes, vlmTierUsed, imageDataUrl, landmarks,
  };
}

/**
 * Returns top N suspect zone ids ranked by lowest confidence.
 * @param {ZoneScore[]} zoneScores
 * @param {number} [n=3]
 * @returns {string[]}
 */
export function topSuspectZones(zoneScores, n = 3) {
  return [...zoneScores]
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, n)
    .map((z) => z.zone);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _mergeScores(zones, featureMap, symmetryResults, uniformity, differentialScores, sunscreenType, skinTone) {
  const suspectZones = new Set();
  for (const s of symmetryResults) {
    if (s.asymmetryScore > 0.25) {
      if (s.suspectSide === 'left')  suspectZones.add(s.leftId);
      if (s.suspectSide === 'right') suspectZones.add(s.rightId);
    }
  }

  const darkSkin   = ['V', 'VI'].includes(skinTone);
  const lightSkin  = ['I', 'II'].includes(skinTone);
  const isChemical = sunscreenType === 'chemical';
  const isMineral  = sunscreenType === 'mineral';

  return zones.map((zone) => {
    const feat     = featureMap[zone.id];
    const evidence = [];

    if (!feat) return { zone: zone.id, status: 'missed', confidence: 0, evidence: ['no_crop'] };

    if (suspectZones.has(zone.id))              evidence.push('asymmetric_specular');
    if (uniformity.outlierZones.includes(zone.id)) evidence.push('below_uniformity_threshold');

    // Differential evidence (Precise Mode)
    const diff = differentialScores?.[zone.id];
    if (diff) {
      if (diff.newCoverageDetected)  evidence.push('differential_covered');
      else if (diff.deltaSpecular < 0.03) evidence.push('differential_thin');
    }

    let specular = feat.specular;
    if (isChemical)             specular = Math.min(specular * 1.5, 1);
    if (isMineral && lightSkin) specular *= 0.9;
    if (darkSkin)               specular = Math.min(specular * 1.2, 1);

    const isSuspect = evidence.some((e) =>
      e === 'asymmetric_specular' || e === 'below_uniformity_threshold' || e === 'differential_thin'
    );

    let status, confidence;
    if (diff?.newCoverageDetected) {
      status = 'covered'; confidence = Math.min(0.95, 0.6 + diff.deltaSpecular);
    } else if (isSuspect) {
      status     = evidence.length >= 2 ? 'missed' : 'partial';
      confidence = Math.max(0.05, specular * 0.5);
    } else {
      status     = specular > 0.12 ? 'covered' : 'partial';
      confidence = Math.min(0.95, 0.45 + specular);
    }

    return { zone: zone.id, status, confidence, evidence };
  });
}

function _mergeVLMEvidence(zoneScores, suspectIds, vlmResult) {
  for (const vlmZone of (vlmResult.zones ?? [])) {
    // Loose match: VLM label ↔ zone id
    const score = zoneScores.find((s) =>
      suspectIds.includes(s.zone) &&
      (vlmZone.zone.toLowerCase().replace(/\s+/g, '-').includes(s.zone.replace(/-/g, ''))
       || s.zone.replace(/-/g, ' ').includes(vlmZone.zone.toLowerCase().replace(/[^a-z ]/g, '')))
    );
    if (!score) continue;

    if (!vlmZone.covered) {
      score.evidence.push('vlm_flagged');
      if (score.status === 'covered') score.status = 'partial';
      score.confidence = Math.min(score.confidence, 0.35);
    } else {
      score.evidence.push('vlm_confirmed');
      if (score.status === 'missed') { score.status = 'partial'; }
      score.confidence = Math.max(score.confidence, 0.55);
    }
  }
}

async function _runDifferential(baselineDataUrl, baselineLandmarks, appliedDataUrl, appliedLandmarks) {
  const results = {};
  const srcBase   = await _imageToCanvas(baselineDataUrl);
  const srcApplied = await _imageToCanvas(appliedDataUrl);

  await Promise.all(getAllZones().map(async (zone) => {
    const baseCrop    = extractZoneCrop(srcBase,    zone.id, baselineLandmarks);
    const appliedCrop = extractZoneCrop(srcApplied, zone.id, appliedLandmarks);
    if (!baseCrop || !appliedCrop) return;

    const [baseFeat, appliedFeat] = await Promise.all([
      extractFeatures(baseCrop,    zone.id),
      extractFeatures(appliedCrop, zone.id),
    ]);

    results[zone.id] = analyzeDifferential(baseFeat, appliedFeat);
  }));

  return results;
}

function _imageToCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
