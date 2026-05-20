/**
 * @module ui/capture
 * @description Camera capture UI. Supports Quick Mode and Precise Mode.
 * Quick Mode: single capture → analyze.
 * Precise Mode: baseline capture (before) → applied capture (after) → differential analyze.
 */

import { startStream, stopStream, captureFrame }        from '../camera.js';
import { startLiveDetection, getLastResult,
         landmarksToNormalized }                         from '../face-mesh.js';
import { analyze }                                       from '../coverage-analyzer.js';
import { getCurrentUVIndex, requestGeolocation,
         describeUV }                                    from '../uv-api.js';
import { getSettings }                                   from '../storage.js';
import { setResult }                                     from './results.js';
import * as runtime                                      from '../llm/runtime.js';

let _stopDetection = null;

/**
 * @param {function(string): void} navigate
 */
export async function mount(navigate) {
  const section = document.querySelector('[data-route="capture"]');
  if (!section) return;

  const settings   = getSettings();
  const preciseMode = settings.preciseModeEnabled ?? false;

  section.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:.75rem">
      <h2 style="font-size:1.1rem">Apply &amp; Capture</h2>
      <div style="display:flex; gap:.5rem">
        ${preciseMode ? '<span class="mode-badge" style="background:var(--color-primary)">Precise</span>' : ''}
        <button class="btn btn-outline" id="history-btn" style="padding:.35rem .8rem; font-size:.8rem">History</button>
        <button class="btn btn-outline" id="settings-btn" style="padding:.35rem .8rem; font-size:.8rem">⚙️</button>
      </div>
    </div>

    <div class="capture-container" id="capture-wrap">
      <video id="viewfinder" autoplay playsinline muted></video>
      <canvas id="mesh-overlay"></canvas>
      <div id="face-hint" style="
        position:absolute; bottom:8px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,.5); color:#fff; font-size:.75rem;
        padding:.25rem .6rem; border-radius:12px; pointer-events:none;
        white-space:nowrap;
      " aria-live="polite">Loading face detector…</div>
    </div>

    <div id="uv-badge" class="text-secondary mt-1" style="font-size:.85rem; text-align:center" aria-live="polite">UV: —</div>

    ${preciseMode ? `
      <div class="card mt-1" style="font-size:.85rem; background:#fff8e1">
        <strong id="precise-step-label">Step 1 of 2 — Before applying sunscreen</strong>
        <p class="text-secondary" style="font-size:.8rem; margin-top:.2rem" id="precise-step-desc">
          Take a baseline photo before applying.
        </p>
      </div>` : `
      <p class="text-secondary mt-1" style="font-size:.8rem; text-align:center">
        Apply sunscreen, wait ~30 s, then tap Capture.
      </p>`}

    <button class="btn btn-primary mt-2" id="capture-btn" style="width:100%">
      ${preciseMode ? '📸 Capture Baseline' : '📸 Capture'}
    </button>

    <div id="model-progress" style="display:none; margin-top:.5rem">
      <div style="background:#eee; border-radius:8px; height:6px; overflow:hidden">
        <div id="model-progress-bar" style="height:100%; background:var(--color-primary); width:0%; transition:width .3s"></div>
      </div>
      <p id="model-progress-label" class="text-secondary" style="font-size:.75rem; text-align:center; margin-top:.25rem"></p>
    </div>

    <div id="status-msg" class="text-secondary mt-1" style="font-size:.8rem; text-align:center; min-height:1.2em" aria-live="polite"></div>

    <div id="install-banner" style="display:none; margin-top:.75rem"></div>
  `;

  const videoEl    = document.getElementById('viewfinder');
  const overlayEl  = document.getElementById('mesh-overlay');
  const captureBtn = document.getElementById('capture-btn');
  const faceHint   = document.getElementById('face-hint');
  const statusMsg  = document.getElementById('status-msg');

  document.getElementById('history-btn').addEventListener('click', () => navigate('history'));
  document.getElementById('settings-btn').addEventListener('click', () => navigate('settings'));

  // ── Start camera ──────────────────────────────────────────────────────────
  try {
    await startStream(videoEl, 'user');
    _syncOverlaySize(videoEl, overlayEl);
    statusMsg.textContent = 'Camera ready.';
  } catch (err) {
    statusMsg.textContent = `Camera error: ${err.message}`;
    captureBtn.disabled = true;
    return;
  }

  // Show active AI tier so user knows what to expect
  _displayActiveTier(statusMsg);

  // ── Face detection loop ───────────────────────────────────────────────────
  _stopDetection = startLiveDetection(videoEl, overlayEl);

  let _hintUpdated = false;
  const _hintCheck = setInterval(() => {
    if (_hintUpdated) return;
    const ctx = overlayEl.getContext('2d');
    const data = ctx.getImageData(0, 0, Math.min(overlayEl.width, 4), Math.min(overlayEl.height, 4)).data;
    if (data.some((v, i) => i % 4 === 3 && v > 0)) {
      faceHint.textContent = '✅ Face detected — ready to capture';
      _hintUpdated = true;
      clearInterval(_hintCheck);
    }
  }, 800);

  setTimeout(() => { if (!_hintUpdated) faceHint.textContent = 'Position face in frame'; }, 3000);

  // ── UV badge ──────────────────────────────────────────────────────────────
  _fetchUV();

  // ── PWA install banner ────────────────────────────────────────────────────
  _watchInstallPrompt();

  // ── Capture logic ─────────────────────────────────────────────────────────
  if (preciseMode) {
    _runPreciseMode(videoEl, captureBtn, statusMsg, navigate, settings);
  } else {
    captureBtn.addEventListener('click', () =>
      _doQuickCapture(videoEl, captureBtn, statusMsg, navigate, settings)
    );
  }
}

/** Called by router when navigating away. */
export function unmount() {
  const videoEl = document.getElementById('viewfinder');
  if (videoEl) stopStream(videoEl);
  if (_stopDetection) { _stopDetection(); _stopDetection = null; }
}

// ─── Active tier display ──────────────────────────────────────────────────────

async function _displayActiveTier(statusEl) {
  try {
    const tier = await runtime.getActiveTier();
    const hints = {
      smolvlm:    'AI: SmolVLM — ~500 MB download on first capture',
      gemma3n:    'AI: Gemma 3N — ~3 GB download on first capture',
      claude:     'AI: Claude API (cloud, sends photo to Anthropic)',
      heuristics: 'AI: Heuristics only — no model. Tap ⚙️ to choose SmolVLM or Claude.',
    };
    if (statusEl) statusEl.textContent = hints[tier] ?? `AI: ${tier}`;
  } catch (err) {
    console.warn('[capture] Could not get active tier:', err);
  }
}

// ─── Model progress UI ────────────────────────────────────────────────────────

function _showModelProgress(pct, label) {
  const wrap = document.getElementById('model-progress');
  const bar  = document.getElementById('model-progress-bar');
  const lbl  = document.getElementById('model-progress-label');
  if (!wrap) return;
  wrap.style.display = pct >= 1 ? 'none' : 'block';
  if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
  if (lbl) lbl.textContent = label;
}

function _modelProgressCallback(p) {
  const pct   = Math.min(p, 0.999);
  const label = pct < 0.05
    ? 'Loading AI model… (this may take several minutes on mobile)'
    : `Downloading AI model — ${Math.round(pct * 100)}% (do not close the tab)`;
  _showModelProgress(pct, label);
}

// ─── Quick Mode ───────────────────────────────────────────────────────────────

async function _doQuickCapture(videoEl, captureBtn, statusMsg, navigate, settings) {
  captureBtn.disabled    = true;
  captureBtn.textContent = 'Loading AI…';
  statusMsg.textContent  = '';

  try {
    await runtime.loadModel(_modelProgressCallback);
    _showModelProgress(1, '');

    captureBtn.textContent = 'Analyzing…';
    const result = await analyze(videoEl, {
      skinTone:      settings.skinTone,
      sunscreenType: settings.sunscreenType,
    });
    setResult(result);
    stopStream(videoEl);
    if (_stopDetection) { _stopDetection(); _stopDetection = null; }
    navigate('results');
  } catch (err) {
    console.error('[capture] Analysis failed', err);
    captureBtn.disabled    = false;
    captureBtn.textContent = '📸 Capture';
    statusMsg.textContent  = `Error: ${err.message}`;
    _showModelProgress(1, '');
  }
}

// ─── Precise Mode ─────────────────────────────────────────────────────────────

function _runPreciseMode(videoEl, captureBtn, statusMsg, navigate, settings) {
  let baselineDataUrl   = null;
  let baselineLandmarks = null;

  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;

    if (!baselineDataUrl) {
      captureBtn.textContent = 'Capturing…';
      try {
        baselineDataUrl   = captureFrame(videoEl);
        baselineLandmarks = landmarksToNormalized(getLastResult());
        const stepLabel = document.getElementById('precise-step-label');
        const stepDesc  = document.getElementById('precise-step-desc');
        if (stepLabel) stepLabel.textContent = 'Step 2 of 2 — After applying sunscreen';
        if (stepDesc)  stepDesc.textContent  = 'Apply sunscreen fully, wait ~30 s, then capture.';
        captureBtn.textContent = '📸 Capture After';
        captureBtn.disabled    = false;
        statusMsg.textContent  = 'Baseline saved. Now apply sunscreen and capture again.';
      } catch (err) {
        captureBtn.disabled    = false;
        captureBtn.textContent = '📸 Capture Baseline';
        statusMsg.textContent  = `Error: ${err.message}`;
      }
    } else {
      captureBtn.textContent = 'Loading AI…';
      statusMsg.textContent  = '';
      try {
        await runtime.loadModel(_modelProgressCallback);
        _showModelProgress(1, '');

        captureBtn.textContent = 'Analyzing…';
        const result = await analyze(videoEl, {
          skinTone:          settings.skinTone,
          sunscreenType:     settings.sunscreenType,
          baselineDataUrl,
          baselineLandmarks,
        });
        setResult(result);
        stopStream(videoEl);
        if (_stopDetection) { _stopDetection(); _stopDetection = null; }
        navigate('results');
      } catch (err) {
        console.error('[capture] Precise analysis failed', err);
        captureBtn.disabled    = false;
        captureBtn.textContent = '📸 Capture After';
        statusMsg.textContent  = `Error: ${err.message}`;
        _showModelProgress(1, '');
      }
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _syncOverlaySize(videoEl, canvasEl) {
  canvasEl.width  = videoEl.videoWidth  || 640;
  canvasEl.height = videoEl.videoHeight || 480;
  videoEl.addEventListener('resize', () => {
    canvasEl.width  = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
  });
}

async function _fetchUV() {
  try {
    const { lat, lon } = await requestGeolocation();
    const { uvIndex, description } = await getCurrentUVIndex(lat, lon);
    const badge = document.getElementById('uv-badge');
    if (badge) {
      const color = uvIndex >= 8 ? 'var(--color-danger)' : uvIndex >= 6 ? 'var(--color-warning)' : 'inherit';
      badge.innerHTML = `UV Index: <strong style="color:${color}">${uvIndex}</strong> (${description})`;
    }
  } catch {
    // Geolocation denied or unavailable — silently skip
  }
}

let _installPrompt = null;
function _watchInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _installPrompt = e;
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    banner.style.display = 'block';
    banner.innerHTML = `
      <button class="btn btn-outline" id="install-btn" style="width:100%; font-size:.85rem">
        📲 Add to Home Screen
      </button>`;
    document.getElementById('install-btn').addEventListener('click', async () => {
      _installPrompt.prompt();
      const { outcome } = await _installPrompt.userChoice;
      if (outcome === 'accepted') banner.style.display = 'none';
      _installPrompt = null;
    });
  });
}
