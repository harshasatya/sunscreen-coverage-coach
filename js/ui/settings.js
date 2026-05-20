/**
 * @module ui/settings
 * @description Settings page: VLM tier, Claude API key, skin tone,
 * sunscreen type, reapply interval, Precise Mode toggle, data reset.
 */

import { getSettings, saveSettings }  from '../storage.js';
import { detectTier, setBackend }     from '../llm/runtime.js';

/**
 * @param {function(string): void} navigate
 */
export async function mount(navigate) {
  const section = document.querySelector('[data-route="settings"]');
  if (!section) return;

  const s       = getSettings();
  const detected = await detectTier();

  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:.75rem; margin-bottom:.75rem">
      <button class="btn btn-outline" id="settings-back" style="padding:.35rem .8rem; font-size:.8rem">← Back</button>
      <h2 style="font-size:1.1rem">Settings</h2>
    </div>

    <!-- Analysis backend -->
    <div class="card" style="margin-bottom:.75rem">
      <h3 style="font-size:.95rem; margin-bottom:.5rem">Analysis Backend</h3>
      <p class="text-secondary" style="font-size:.8rem; margin-bottom:.5rem">
        Detected capability: <strong>${detected}</strong>
      </p>
      ${_tierRadios(s.vlmBackend ?? detected)}
      <div id="api-key-wrap" style="margin-top:.75rem; ${(s.vlmBackend ?? detected) === 'claude' ? '' : 'display:none'}">
        <label style="font-size:.85rem; display:block; margin-bottom:.25rem">
          Claude API key
          <input id="claude-api-key" type="password" placeholder="sk-ant-…"
                 value="${s.claudeApiKey ?? ''}"
                 style="display:block; width:100%; margin-top:.25rem; padding:.4rem .6rem;
                        border-radius:6px; border:1px solid #ccc; font-size:.85rem">
        </label>
        <p class="text-secondary" style="font-size:.72rem; margin-top:.3rem">
          Stored in browser localStorage only. One photo per session is sent for analysis — never stored remotely.
        </p>
      </div>
    </div>

    <!-- Skin profile -->
    <div class="card" style="margin-bottom:.75rem">
      <h3 style="font-size:.95rem; margin-bottom:.5rem">Skin Profile</h3>
      <label style="display:block; margin-bottom:.5rem; font-size:.875rem">
        Fitzpatrick skin tone
        <select id="skin-tone" style="display:block; margin-top:.25rem; width:100%; padding:.4rem; border-radius:6px; border:1px solid #ccc">
          ${['I','II','III','IV','V','VI'].map((t) => `
            <option value="${t}" ${s.skinTone === t ? 'selected' : ''}>${t}${_skinToneLabel(t)}</option>
          `).join('')}
        </select>
      </label>
      <label style="display:block; font-size:.875rem">
        Sunscreen type
        <select id="sun-type" style="display:block; margin-top:.25rem; width:100%; padding:.4rem; border-radius:6px; border:1px solid #ccc">
          <option value="mineral"  ${s.sunscreenType === 'mineral'  ? 'selected' : ''}>Mineral (zinc oxide / titanium dioxide)</option>
          <option value="chemical" ${s.sunscreenType === 'chemical' ? 'selected' : ''}>Chemical</option>
          <option value="hybrid"   ${s.sunscreenType === 'hybrid'   ? 'selected' : ''}>Hybrid</option>
        </select>
      </label>
    </div>

    <!-- Reminders -->
    <div class="card" style="margin-bottom:.75rem">
      <h3 style="font-size:.95rem; margin-bottom:.5rem">Reapply Reminder</h3>
      <label style="display:flex; align-items:center; justify-content:space-between; font-size:.875rem">
        Interval (minutes)
        <input id="reapply-mins" type="number" min="30" max="240" step="15"
               value="${s.reapplyIntervalMinutes ?? 120}"
               style="width:70px; padding:.35rem; border-radius:6px; border:1px solid #ccc; text-align:center">
      </label>
    </div>

    <!-- Precise Mode -->
    <div class="card" style="margin-bottom:.75rem">
      <h3 style="font-size:.95rem; margin-bottom:.25rem">Precise Mode</h3>
      <p class="text-secondary" style="font-size:.8rem; margin-bottom:.5rem">
        Takes a before/after capture pair and uses pixel-level difference to detect newly applied sunscreen.
      </p>
      <label style="display:flex; align-items:center; gap:.6rem; cursor:pointer; font-size:.9rem">
        <input id="precise-toggle" type="checkbox" ${s.preciseModeEnabled ? 'checked' : ''}>
        Enable Precise Mode
      </label>
    </div>

    <!-- Save -->
    <button class="btn btn-primary" id="save-btn" style="width:100%">Save Settings</button>
    <div id="save-status" style="text-align:center; font-size:.8rem; margin-top:.4rem; min-height:1.2em" aria-live="polite"></div>

    <!-- Reset -->
    <button class="btn btn-outline" id="reset-btn" style="width:100%; margin-top:.75rem; color:var(--color-danger); border-color:var(--color-danger)">
      Reset All Settings
    </button>
  `;

  // Show/hide API key when backend selection changes
  section.querySelectorAll('input[name="backend"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.getElementById('api-key-wrap').style.display =
        radio.value === 'claude' ? 'block' : 'none';
    });
  });

  document.getElementById('settings-back').addEventListener('click', () => navigate('capture'));

  document.getElementById('save-btn').addEventListener('click', () => {
    const backend  = section.querySelector('input[name="backend"]:checked')?.value;
    const apiKey   = document.getElementById('claude-api-key').value.trim();
    const skinTone = document.getElementById('skin-tone').value;
    const sunType  = document.getElementById('sun-type').value;
    const mins     = parseInt(document.getElementById('reapply-mins').value, 10) || 120;
    const precise  = document.getElementById('precise-toggle').checked;

    saveSettings({
      skinTone,
      sunscreenType: sunType,
      reapplyIntervalMinutes: mins,
      preciseModeEnabled: precise,
      claudeApiKey: apiKey || undefined,
    });
    if (backend) setBackend(backend);

    const status = document.getElementById('save-status');
    status.textContent = 'Settings saved.';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Reset all settings to defaults?')) return;
    localStorage.removeItem('suncoach_settings');
    navigate('onboarding');
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _tierRadios(selected) {
  const tiers = [
    { id: 'gemma3n',    label: 'On-device Gemma 3n',   desc: '~3 GB download, best accuracy' },
    { id: 'smolvlm',    label: 'On-device SmolVLM',    desc: '~500 MB download' },
    { id: 'claude',     label: 'Claude API (cloud)',   desc: 'Fast, no download, sends photo' },
    { id: 'heuristics', label: 'Heuristics only',      desc: 'No AI, basic mode' },
  ];
  return `<div style="display:flex; flex-direction:column; gap:.4rem">
    ${tiers.map(({ id, label, desc }) => `
      <label style="display:flex; align-items:center; gap:.5rem; cursor:pointer; font-size:.875rem">
        <input type="radio" name="backend" value="${id}" ${id === selected ? 'checked' : ''}>
        ${label} <span class="text-secondary" style="font-size:.75rem">(${desc})</span>
      </label>
    `).join('')}
  </div>`;
}

function _skinToneLabel(t) {
  return { I: ' — Very fair', II: ' — Fair', III: ' — Medium', IV: ' — Olive', V: ' — Brown', VI: ' — Deep' }[t] ?? '';
}
