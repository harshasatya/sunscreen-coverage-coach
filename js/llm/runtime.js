/**
 * @module llm/runtime
 * @description VLM tier abstraction layer. Auto-detects device capability and
 * selects the best available backend. Exposes a single analyze() method so the
 * rest of the app never needs to know which tier is active.
 *
 * Tier selection priority:
 *   gemma3n  — navigator.gpu available AND deviceMemory >= 6 GB
 *   smolvlm  — navigator.gpu OR deviceMemory >= 3 GB
 *   claude   — API key present in Settings
 *   heuristics — offline fallback (no model output; symmetry/uniformity only)
 *
 * The user can override auto-detection via Settings. The override is persisted
 * in localStorage by saveSettings({ vlmTier }).
 */

import * as gemma3n  from './backends/gemma3n.js';
import * as smolvlm  from './backends/smolvlm.js';
import * as claude   from './backends/claude.js';
import { getSettings, saveSettings } from '../storage.js';

const BACKENDS = { gemma3n, smolvlm, claude };

/**
 * Detects which tier the device can support.
 * @returns {Promise<'gemma3n'|'smolvlm'|'claude'|'heuristics'>}
 */
export async function detectTier() {
  const hasGPU = !!navigator.gpu;
  const ram = navigator.deviceMemory ?? 4;

  console.log(`[runtime] Detecting tier — GPU: ${hasGPU}, RAM: ${ram} GB`);

  if (hasGPU && ram >= 6 && await gemma3n.isAvailable()) return 'gemma3n';
  if ((hasGPU || ram >= 3) && await smolvlm.isAvailable())  return 'smolvlm';
  if (await claude.isAvailable())                            return 'claude';
  return 'heuristics';
}

/**
 * Returns the active tier name from Settings (or auto-detects and saves it).
 * @returns {Promise<'gemma3n'|'smolvlm'|'claude'|'heuristics'>}
 */
export async function getActiveTier() {
  const { vlmTier } = getSettings();
  if (vlmTier) {
    console.log(`[runtime] Active tier (from settings): ${vlmTier}`);
    return vlmTier;
  }
  const detected = await detectTier();
  console.log(`[runtime] Detected tier: ${detected}`);
  saveSettings({ vlmTier: detected });
  return detected;
}

/**
 * Manually override the active backend tier.
 * @param {'gemma3n'|'smolvlm'|'claude'|'heuristics'} tier
 */
export function setBackend(tier) {
  console.log(`[runtime] Backend set to: ${tier}`);
  saveSettings({ vlmTier: tier });
}

/**
 * Loads the model for the active tier (no-op for claude / heuristics).
 * @param {Function} [progressCallback] - receives 0.0–1.0
 * @returns {Promise<void>}
 */
export async function loadModel(progressCallback) {
  const tier = await getActiveTier();
  console.log(`[runtime] loadModel called for tier: ${tier}`);
  const backend = BACKENDS[tier];
  if (backend?.loadModel) {
    await backend.loadModel(progressCallback);
  } else {
    // heuristics or claude — no download needed
    console.log(`[runtime] No model download needed for tier: ${tier}`);
    progressCallback?.(1.0);
  }
}

/**
 * Runs VLM analysis via the active backend.
 * @param {string}                  faceImg
 * @param {Record<string, string>}  crops
 * @param {string[]}                zoneLabels
 * @returns {Promise<import('./prompts.js').VLMResponse>}
 */
export async function analyze(faceImg, crops, zoneLabels) {
  const tier = await getActiveTier();
  const backend = BACKENDS[tier];

  if (!backend) {
    return _heuristicsPlaceholder(zoneLabels);
  }

  try {
    return await backend.analyze(faceImg, crops, zoneLabels);
  } catch (err) {
    console.error(`[runtime] Backend "${tier}" failed:`, err);
    return _heuristicsPlaceholder(zoneLabels);
  }
}

function _heuristicsPlaceholder(zoneLabels) {
  return {
    overall: false,
    zones: (zoneLabels ?? []).map((zone) => ({
      zone,
      covered: false,
      evidence: 'none',
      confidence: 0,
    })),
    notes: 'Heuristics-only mode — no VLM available.',
  };
}
