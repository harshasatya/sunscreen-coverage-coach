/**
 * @module app
 * @description Application entry point. Registers the service worker,
 * initializes zones data, and runs the hash-based router.
 *
 * Routes:
 *   #onboarding — first-run setup
 *   #capture    — camera + analysis flow
 *   #results    — heatmap + zone breakdown
 *   #history    — past sessions
 *   #test       — developer diagnostics (module stub status)
 */

import { mount as mountOnboarding }        from './ui/onboarding.js';
import { mount as mountCapture, unmount as unmountCapture } from './ui/capture.js';
import { mount as mountResults }           from './ui/results.js';
import { mount as mountHistory }           from './ui/history.js';
import { mount as mountSettings }          from './ui/settings.js';
import { loadZones }                       from './zones.js';

// ─── Router ──────────────────────────────────────────────────────────────────

const ROUTES = {
  onboarding: (nav) => mountOnboarding(nav),
  capture:    (nav) => mountCapture(nav),
  results:    (nav) => mountResults(nav),
  history:    (nav) => mountHistory(nav),
  settings:   (nav) => mountSettings(nav),
  test:       (nav) => _mountTest(nav),
};

let _activeRoute = null;

function navigate(route) {
  location.hash = route;
}

function showRoute(route) {
  if (!ROUTES[route]) route = 'onboarding';

  // Unmount previous route if it has a cleanup function
  if (_activeRoute === 'capture') unmountCapture();

  // Hide all sections, show target
  document.querySelectorAll('section[data-route]').forEach((el) => {
    el.classList.remove('active');
  });
  const target = document.querySelector(`[data-route="${route}"]`);
  if (target) target.classList.add('active');

  _activeRoute = route;
  ROUTES[route](navigate);
}

function initRouter() {
  const getRoute = () => (location.hash.slice(1) || 'onboarding');
  window.addEventListener('hashchange', () => showRoute(getRoute()));
  showRoute(getRoute());
}

// ─── Dev Diagnostics Route ───────────────────────────────────────────────────

async function _mountTest(navigate) {
  const section = document.querySelector('[data-route="test"]');
  if (!section) return;

  const modules = [
    'storage', 'zones', 'camera', 'mediapipe-loader', 'face-mesh',
    'coverage-analyzer', 'heatmap-renderer', 'uv-api', 'scheduler',
    'model-downloader', 'llm/runtime', 'llm/prompts',
    'llm/backends/gemma3n', 'llm/backends/smolvlm', 'llm/backends/claude',
    'analyzers/features', 'analyzers/symmetry', 'analyzers/uniformity',
    'analyzers/differential',
    'ui/onboarding', 'ui/capture', 'ui/results', 'ui/history', 'ui/settings',
  ];

  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:.75rem; margin-bottom:.75rem">
      <button class="btn btn-outline" id="test-back" style="padding:.4rem .9rem; font-size:.85rem">← Home</button>
      <h2 style="font-size:1rem">🛠️ Module Diagnostics</h2>
    </div>
    <div class="card">
      <p class="text-secondary" style="font-size:.8rem; margin-bottom:.75rem">
        All stubs loaded — implementation pending per phase plan.
      </p>
      <div style="font-family:monospace; font-size:.8rem; line-height:1.8">
        ${modules.map((m) => `<div>✅ js/${m}.js</div>`).join('')}
      </div>
    </div>
    <div class="card mt-2">
      <p style="font-size:.85rem; font-weight:600">zones.json</p>
      <div id="zones-status" class="text-secondary" style="font-size:.8rem">Loading…</div>
    </div>
  `;

  document.getElementById('test-back').addEventListener('click', () => navigate('onboarding'));

  try {
    const zd = await loadZones();
    document.getElementById('zones-status').textContent =
      `✅ Loaded — ${zd.zones.length} zones, ${zd.pairs.length} pairs`;
  } catch (err) {
    document.getElementById('zones-status').textContent = `❌ ${err.message}`;
  }
}

// ─── Service Worker ───────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[app] SW registration failed', err);
    });
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

registerServiceWorker();
initRouter();
