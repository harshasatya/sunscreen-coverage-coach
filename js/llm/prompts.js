/**
 * @module llm/prompts
 * @description Prompt templates and response parsers for each VLM tier.
 * Tier 1/2 use compact plaintext optimized for small local models.
 * Tier 3 (Claude) uses a structured JSON-mode prompt.
 *
 * All parsers return a VLMResponse or null on parse failure.
 *
 * @typedef {Object} VLMZoneResult
 * @property {string}  zone        - zone id / label
 * @property {boolean} covered     - true if sunscreen detected
 * @property {string}  evidence    - 'sheen' | 'whitening' | 'smooth' | 'none'
 * @property {number}  confidence  - 0.0–1.0
 *
 * @typedef {Object} VLMResponse
 * @property {boolean}        overall   - overall application detected
 * @property {VLMZoneResult[]} zones
 * @property {string}         notes
 */

/**
 * Builds the compact plaintext prompt for Tier 1 (Gemma 3n) / Tier 2 (SmolVLM).
 * @param {string[]} zoneLabels - display names of the 3 suspect zones
 * @returns {string}
 */
export function buildTier1Prompt(zoneLabels) {
  const [z1 = 'Zone 1', z2 = 'Zone 2', z3 = 'Zone 3'] = zoneLabels;
  // TODO: tune prompt based on Gemma 3n tokenization results in Phase 3
  return `You are looking at photos of a person's face after sunscreen application.
Sunscreen signs: sheen, slight whitening (mineral), or smoother skin vs bare.

Images:
- Image 1: full face
- Image 2: close-up "${z1}"
- Image 3: close-up "${z2}"
- Image 4: close-up "${z3}"

Judge if each close-up region appears covered compared to the rest of the face.
Reply in this exact format, no extra text:

OVERALL: yes | no | unclear
CROP_1: yes | partial | no — <sheen | whitening | smooth | none>
CROP_2: yes | partial | no — <sheen | whitening | smooth | none>
CROP_3: yes | partial | no — <sheen | whitening | smooth | none>
NOTES: <one short sentence>`;
}

/**
 * Builds an even more compact prompt for Tier 2 (SmolVLM — smaller context window).
 * @param {string[]} zoneLabels
 * @returns {string}
 */
export function buildTier2Prompt(zoneLabels) {
  const [z1 = 'Zone 1', z2 = 'Zone 2', z3 = 'Zone 3'] = zoneLabels;
  // TODO: validate against SmolVLM-500M context limits in Phase 4
  return `Sunscreen coverage check. Images: full face, then close-ups of "${z1}", "${z2}", "${z3}".
Does each area look covered (sheen/whitening/smooth)?

OVERALL: yes|no|unclear
CROP_1: yes|partial|no — sheen|whitening|smooth|none
CROP_2: yes|partial|no — sheen|whitening|smooth|none
CROP_3: yes|partial|no — sheen|whitening|smooth|none
NOTES: one sentence`;
}

/**
 * Builds the structured JSON prompt for Tier 3 (Claude API).
 * @param {string[]} zoneLabels
 * @returns {string}
 */
export function buildTier3Prompt(zoneLabels) {
  const zoneList = zoneLabels.map((l, i) => `  - Crop ${i + 1}: "${l}"`).join('\n');
  return `You are analyzing sunscreen coverage from a single photo (no baseline available).
You will receive the full face image followed by close-up crops of suspect regions.

Suspect regions:
${zoneList}

Sunscreen indicators: optical sheen, slight whitening (especially mineral formulas), or
a visually smoother texture compared to other areas of the face.

Respond with valid JSON only — no markdown fences, no explanation:
{
  "overall_application_detected": boolean,
  "suspect_zones": [
    {
      "zone_label": "<label from the list above>",
      "covered": "yes" | "partial" | "no",
      "evidence": "sheen" | "whitening" | "smooth" | "none",
      "confidence": 0.0-1.0
    }
  ],
  "additional_misses": ["zone labels you would flag beyond the provided crops"],
  "notes": "brief qualitative summary (one sentence)"
}`;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

const COVERED_MAP = { yes: true, partial: false, no: false };
const COVERED_STATUS = { yes: 'yes', partial: 'partial', no: 'no' };

/**
 * Parses Tier 1 (Gemma 3n) plaintext response.
 * @param {string}   text
 * @param {string[]} zoneLabels - same order as used in prompt
 * @returns {VLMResponse|null}
 */
export function parseTier1Response(text, zoneLabels = []) {
  // TODO: harden with Phase 3 real-model output samples
  try {
    const lines = text.trim().split('\n').map((l) => l.trim());
    const overall = _extractLineValue(lines, 'OVERALL');
    const crop1   = _extractLineValue(lines, 'CROP_1');
    const crop2   = _extractLineValue(lines, 'CROP_2');
    const crop3   = _extractLineValue(lines, 'CROP_3');
    const notes   = _extractLineValue(lines, 'NOTES') || '';

    if (!overall) return null;

    const crops = [crop1, crop2, crop3];
    const zones = crops.map((raw, i) => {
      if (!raw) return null;
      const [verdict, evidence = 'none'] = raw.split('—').map((s) => s.trim().toLowerCase());
      return {
        zone: zoneLabels[i] || `crop_${i + 1}`,
        covered: COVERED_MAP[verdict] ?? false,
        evidence: evidence.replace(/[^a-z]/g, '') || 'none',
        confidence: verdict === 'yes' ? 0.85 : verdict === 'partial' ? 0.5 : 0.15,
      };
    }).filter(Boolean);

    return {
      overall: overall.toLowerCase() === 'yes',
      zones,
      notes,
    };
  } catch {
    return null;
  }
}

/**
 * Parses Tier 2 (SmolVLM) plaintext response — same format as Tier 1.
 * @param {string}   text
 * @param {string[]} zoneLabels
 * @returns {VLMResponse|null}
 */
export function parseTier2Response(text, zoneLabels = []) {
  return parseTier1Response(text, zoneLabels);
}

/**
 * Parses Tier 3 (Claude) JSON response.
 * @param {string}   jsonText
 * @param {string[]} zoneLabels
 * @returns {VLMResponse|null}
 */
export function parseTier3Response(jsonText, zoneLabels = []) {
  try {
    const cleaned = jsonText.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    const zones = (parsed.suspect_zones || []).map((z) => ({
      zone: z.zone_label || '',
      covered: z.covered === 'yes',
      evidence: z.evidence || 'none',
      confidence: typeof z.confidence === 'number' ? z.confidence : 0.5,
    }));

    return {
      overall: !!parsed.overall_application_detected,
      zones,
      notes: parsed.notes || '',
    };
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _extractLineValue(lines, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'i');
  for (const line of lines) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}
