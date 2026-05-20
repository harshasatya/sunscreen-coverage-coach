/**
 * @module ui/onboarding
 * @description Onboarding flow shown on first launch.
 * Collects: camera/notification permissions, VLM tier selection
 * (with device capability hints), skin tone, sunscreen type.
 * Writes completed settings via storage.js and navigates to #capture.
 *
 * Steps:
 *   1. Welcome
 *   2. Permissions (camera + notifications)
 *   3. VLM tier selection (auto-detected, user can override)
 *   4. Skin tone (Fitzpatrick I–VI)
 *   5. Sunscreen type (mineral / chemical / hybrid)
 *   6. Complete → navigate to #capture
 */

import { getSettings, saveSettings } from '../storage.js';
import { detectTier, setBackend }    from '../llm/runtime.js';

/**
 * Mounts the onboarding UI into section[data-route="onboarding"].
 * @param {function(string): void} navigate - router navigate helper
 */
export function mount(navigate) {
  const section = document.querySelector('[data-route="onboarding"]');
  if (!section) return;

  const { onboardingComplete } = getSettings();
  if (onboardingComplete) {
    navigate('capture');
    return;
  }

  // TODO: implement multi-step wizard in Phase 1
  // For now: render a placeholder that lets the developer skip to capture
  section.innerHTML = `
    <div class="card mt-2">
      <h1 style="font-size:1.4rem; margin-bottom:.5rem">☀️ Sunscreen Coverage Coach</h1>
      <p class="text-secondary" style="font-size:.9rem">
        Estimates coverage gaps on your face from a single selfie — fully on-device.
      </p>
    </div>

    <div class="card mt-2">
      <h2 style="font-size:1rem; margin-bottom:.75rem">Quick Setup</h2>
      <label style="display:block; margin-bottom:.5rem; font-size:.9rem">
        Skin tone (Fitzpatrick scale)
        <select id="ob-skin-tone" style="display:block; margin-top:.25rem; width:100%; padding:.4rem; border-radius:6px; border:1px solid #ccc">
          <option value="I">I — Very fair</option>
          <option value="II">II — Fair</option>
          <option value="III" selected>III — Medium</option>
          <option value="IV">IV — Olive</option>
          <option value="V">V — Brown</option>
          <option value="VI">VI — Dark brown/black</option>
        </select>
      </label>
      <label style="display:block; margin-bottom:.75rem; font-size:.9rem">
        Sunscreen type
        <select id="ob-sun-type" style="display:block; margin-top:.25rem; width:100%; padding:.4rem; border-radius:6px; border:1px solid #ccc">
          <option value="mineral" selected>Mineral (zinc oxide / titanium dioxide)</option>
          <option value="chemical">Chemical</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </label>
    </div>

    <div class="card mt-2" id="ob-tier-card">
      <h2 style="font-size:1rem; margin-bottom:.5rem">Analysis backend</h2>
      <p class="text-secondary" style="font-size:.85rem" id="ob-tier-hint">Detecting device capabilities…</p>
      <div id="ob-tier-options" style="margin-top:.75rem; display:flex; flex-direction:column; gap:.5rem"></div>
    </div>

    <button class="btn btn-primary mt-3" id="ob-start-btn" style="width:100%">
      Get Started
    </button>

    <p class="text-secondary mt-2" style="font-size:.75rem; text-align:center">
      Quick Mode runs entirely on your device. With cloud backend (optional),
      only the photo you just took is sent for analysis — never stored remotely.
    </p>
  `;

  _populateTierOptions();

  document.getElementById('ob-start-btn').addEventListener('click', () => {
    const skinTone     = document.getElementById('ob-skin-tone').value;
    const sunscreenType = document.getElementById('ob-sun-type').value;
    const selectedTier = document.querySelector('input[name="ob-tier"]:checked')?.value;
    saveSettings({ skinTone, sunscreenType, onboardingComplete: true });
    if (selectedTier) setBackend(selectedTier);
    navigate('capture');
  });
}

async function _populateTierOptions() {
  const hint    = document.getElementById('ob-tier-hint');
  const options = document.getElementById('ob-tier-options');
  const detected = await detectTier();

  const tiers = [
    { id: 'gemma3n',    label: 'On-device — Gemma 3n (~3 GB download)', badge: 'Best accuracy' },
    { id: 'smolvlm',    label: 'On-device — SmolVLM (~500 MB download)', badge: 'Smaller model' },
    { id: 'claude',     label: 'Cloud — Claude API (no download, privacy note)', badge: 'Fastest' },
    { id: 'heuristics', label: 'Heuristics only — no AI model', badge: 'Basic mode' },
  ];

  hint.textContent = `Recommended for your device: ${detected}`;
  options.innerHTML = tiers.map(({ id, label, badge }) => `
    <label style="display:flex; align-items:center; gap:.6rem; cursor:pointer; font-size:.9rem">
      <input type="radio" name="ob-tier" value="${id}" ${id === detected ? 'checked' : ''}>
      <span>${label} <em style="font-size:.75rem; color:#888">(${badge})</em></span>
    </label>
  `).join('');
}
