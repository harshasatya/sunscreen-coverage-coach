/**
 * @module ui/results
 * @description Results view: face photo with landmark-polygon heatmap overlay,
 * missed-spots list (grouped by status), overall score, reapply button.
 * Analysis data is passed in via setResult() before navigation.
 */

import { renderHeatmap }                    from '../heatmap-renderer.js';
import { saveSession, generateId, getSettings } from '../storage.js';
import { scheduleReminder }                 from '../scheduler.js';
import { getAllZones, loadZones }           from '../zones.js';
import { getCurrentUVIndex, requestGeolocation } from '../uv-api.js';

/** @type {import('../coverage-analyzer.js').AnalysisResult|null} */
let _lastResult = null;

/**
 * Called by capture.js before navigating here.
 * @param {import('../coverage-analyzer.js').AnalysisResult} result
 */
export function setResult(result) {
  _lastResult = result;
}

/**
 * @param {function(string): void} navigate
 */
export async function mount(navigate) {
  const section = document.querySelector('[data-route="results"]');
  if (!section) return;

  await loadZones();

  if (!_lastResult) {
    section.innerHTML = `
      <p class="text-secondary">No analysis yet.</p>
      <button class="btn btn-primary mt-2" id="back-btn">Back to Capture</button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => navigate('capture'));
    return;
  }

  const {
    zones, overallApplicationDetected, lowOverallWarning,
    vlmNotes, vlmTierUsed, imageDataUrl, landmarks,
  } = _lastResult;

  const { reapplyIntervalMinutes } = getSettings();

  const covered = zones.filter((z) => z.status === 'covered');
  const partial = zones.filter((z) => z.status === 'partial');
  const missed  = zones.filter((z) => z.status === 'missed' && z.confidence > 0);
  const scorePct = zones.length
    ? Math.round((covered.length / zones.length) * 100)
    : 0;

  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:.75rem; margin-bottom:.75rem">
      <button class="btn btn-outline" id="back-btn" style="padding:.35rem .8rem; font-size:.8rem">← Recapture</button>
      <h2 style="font-size:1.1rem">Coverage Results</h2>
    </div>

    ${lowOverallWarning ? `
      <div class="card" style="border-left:4px solid var(--color-warning); margin-bottom:.75rem; font-size:.9rem">
        ⚠️ Very low application detected — reapply and re-check.
      </div>` : ''}

    <!-- Score pill -->
    <div class="card" style="text-align:center; margin-bottom:.75rem">
      <div style="font-size:2.8rem; font-weight:800; line-height:1">${scorePct}%</div>
      <div class="text-secondary" style="font-size:.8rem; margin-top:.25rem">zones covered</div>
      <div style="margin-top:.5rem">
        ${vlmTierUsed === 'heuristics' || !overallApplicationDetected
          ? '<span class="mode-badge basic">Basic Mode</span>'
          : '<span class="mode-badge" style="background:var(--color-success)">Heuristics</span>'}
      </div>
    </div>

    <!-- Heatmap -->
    <div style="position:relative; width:100%; max-width:480px; margin:0 auto .75rem;
                border-radius:var(--radius-md); overflow:hidden; background:#111; aspect-ratio:4/3">
      <canvas id="result-heatmap" style="width:100%; height:100%; display:block"></canvas>
      <div id="heatmap-loading" style="position:absolute; inset:0; display:flex;
           align-items:center; justify-content:center; color:#fff; font-size:.85rem">
        Rendering…
      </div>
    </div>

    <!-- AI notes -->
    ${vlmNotes ? `
      <div class="card" style="margin-bottom:.75rem; font-size:.85rem">
        <strong>Summary:</strong> ${vlmNotes}
      </div>` : ''}

    <!-- Zone breakdown -->
    <div class="card" style="margin-bottom:.75rem">
      <h3 style="font-size:.95rem; margin-bottom:.5rem">Zone Breakdown</h3>
      ${_renderMissed(missed)}
      ${_renderGroup('Partial coverage', partial, 'partial')}
      ${_renderGroup('Covered', covered, 'covered')}
    </div>

    <!-- Actions -->
    <button class="btn btn-primary" id="reapply-btn" style="width:100%">
      ⏰ Remind me to reapply (${reapplyIntervalMinutes} min)
    </button>
    <div style="display:flex; gap:.75rem; margin-top:.75rem">
      <button class="btn btn-outline" id="history-btn" style="flex:1">History</button>
      <button class="btn btn-outline" id="new-btn" style="flex:1">New Capture</button>
    </div>

    <p class="text-secondary mt-2" style="font-size:.75rem; text-align:center">
      Estimates coverage gaps — not SPF or UV protection.
    </p>
  `;

  document.getElementById('back-btn').addEventListener('click', () => navigate('capture'));
  document.getElementById('new-btn').addEventListener('click', () => navigate('capture'));
  document.getElementById('history-btn').addEventListener('click', () => navigate('history'));

  document.getElementById('reapply-btn').addEventListener('click', async () => {
    let uvFactor = 1;
    try {
      const { lat, lon } = await requestGeolocation();
      const uv = await getCurrentUVIndex(lat, lon);
      uvFactor = uv.reapplyFactor;
    } catch { /* no geolocation — use base interval */ }
    const adjusted = await scheduleReminder(reapplyIntervalMinutes, { uvReapplyFactor: uvFactor });
    const btn = document.getElementById('reapply-btn');
    if (btn) btn.textContent = `✅ Reminder set for ${adjusted ?? reapplyIntervalMinutes} min`;
  });

  // Render heatmap async (might need to load image)
  _renderHeatmapAsync(zones, landmarks, imageDataUrl);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _renderHeatmapAsync(zones, landmarks, imageDataUrl) {
  const canvas  = document.getElementById('result-heatmap');
  const loading = document.getElementById('heatmap-loading');
  if (!canvas) return;

  // Size the canvas to a 4:3 aspect ratio at the container width
  const container = canvas.parentElement;
  const w = container.offsetWidth  || 480;
  const h = container.offsetHeight || Math.round(w * 3 / 4);
  canvas.width  = w;
  canvas.height = h;

  await renderHeatmap(canvas, landmarks, zones, getAllZones(), imageDataUrl);
  if (loading) loading.style.display = 'none';
}

function _renderMissed(missed) {
  if (!missed.length) return '';
  return `
    <div style="margin-bottom:.5rem">
      <div style="font-size:.8rem; font-weight:700; color:var(--color-danger); margin-bottom:.3rem">
        ❌ Likely missed (${missed.length})
      </div>
      ${missed.map((z) => `
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:.3rem 0; border-bottom:1px solid #f0f0f0; font-size:.85rem">
          <span>${_formatZoneLabel(z.zone)}</span>
          <span style="display:flex; gap:.4rem">
            ${z.evidence.map(_evidenceBadge).join('')}
          </span>
        </div>`).join('')}
    </div>`;
}

function _renderGroup(title, items, status) {
  if (!items.length) return '';
  const icon = status === 'covered' ? '✅' : '⚠️';
  return `
    <details style="margin-top:.4rem">
      <summary style="font-size:.8rem; cursor:pointer; color:var(--color-text-secondary)">
        ${icon} ${title} (${items.length})
      </summary>
      <div style="margin-top:.3rem">
        ${items.map((z) => `
          <div style="display:flex; justify-content:space-between; align-items:center;
                      padding:.25rem 0; border-bottom:1px solid #f5f5f5; font-size:.82rem">
            <span class="text-secondary">${_formatZoneLabel(z.zone)}</span>
            <span class="zone-badge ${status}">${Math.round(z.confidence * 100)}%</span>
          </div>`).join('')}
      </div>
    </details>`;
}

function _formatZoneLabel(zoneId) {
  return zoneId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function _evidenceBadge(ev) {
  const labels = {
    asymmetric_specular:        'Asymmetric',
    below_uniformity_threshold: 'Low coverage',
    no_crop:                    'No data',
  };
  return `<span style="font-size:.7rem; background:#fde8e8; color:#c0392b;
                        padding:.1rem .35rem; border-radius:4px">
            ${labels[ev] ?? ev}
          </span>`;
}
