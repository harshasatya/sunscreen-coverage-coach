/**
 * @module ui/history
 * @description History view: scrollable list of past sessions with thumbnail,
 * date, overall coverage score, and most-missed zones trend.
 */

import { getSessions } from '../storage.js';

/**
 * @param {function(string): void} navigate
 */
export async function mount(navigate) {
  const section = document.querySelector('[data-route="history"]');
  if (!section) return;

  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:.75rem; margin-bottom:.75rem">
      <button class="btn btn-outline" id="back-capture" style="padding:.4rem .9rem; font-size:.85rem">← Back</button>
      <h2 style="font-size:1.1rem">Session History</h2>
    </div>
    <div id="trend-section"></div>
    <div id="history-list"></div>
  `;

  document.getElementById('back-capture').addEventListener('click', () => navigate('capture'));

  const sessions = await getSessions(50);
  const list = document.getElementById('history-list');
  const trendEl = document.getElementById('trend-section');

  if (!sessions.length) {
    list.innerHTML = `<p class="text-secondary" style="text-align:center; margin-top:2rem">
      No sessions saved yet.<br>Complete a capture to see your history.
    </p>`;
    return;
  }

  // Trend: count missed+partial occurrences per zone across all sessions
  const missCount = {};
  for (const s of sessions) {
    const zones = s.zoneScores ? Object.values(s.zoneScores) : [];
    for (const z of zones) {
      if (z.status === 'missed' || z.status === 'partial') {
        missCount[z.zone] = (missCount[z.zone] ?? 0) + (z.status === 'missed' ? 2 : 1);
      }
    }
  }
  const topMissed = Object.entries(missCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topMissed.length) {
    const maxScore = topMissed[0][1];
    trendEl.innerHTML = `
      <div class="card" style="margin-bottom:.75rem">
        <h3 style="font-size:.9rem; margin-bottom:.5rem">Most-missed zones (${sessions.length} sessions)</h3>
        ${topMissed.map(([zone, score]) => {
          const pct = Math.round((score / maxScore) * 100);
          const label = zone.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return `
            <div style="margin-bottom:.4rem">
              <div style="display:flex; justify-content:space-between; font-size:.8rem; margin-bottom:.15rem">
                <span>${label}</span><span class="text-secondary">${score} pts</span>
              </div>
              <div class="progress-bar">
                <div class="progress-bar__fill" style="width:${pct}%; background:var(--color-danger)"></div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  list.innerHTML = sessions.map((s) => {
    const date      = new Date(s.timestamp).toLocaleDateString();
    const time      = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const zones     = s.zoneScores ? Object.values(s.zoneScores) : [];
    const covered   = zones.filter((z) => z.status === 'covered').length;
    const scorePct  = zones.length ? Math.round((covered / zones.length) * 100) : 0;
    const missed    = zones.filter((z) => z.status === 'missed').map((z) =>
      z.zone.replace(/-/g, ' ')).slice(0, 3);

    return `
      <div class="card" style="display:flex; gap:.75rem; align-items:flex-start; margin-bottom:.75rem">
        <div class="session-thumb" style="background:#ddd; border-radius:8px; width:60px; height:60px; flex-shrink:0; overflow:hidden">
          ${s.imageDataUrl ? `<img src="${s.imageDataUrl}" style="width:100%;height:100%;object-fit:cover" alt="">` : ''}
        </div>
        <div style="flex:1; min-width:0">
          <div style="font-weight:600; font-size:.9rem">${date} at ${time}</div>
          <div class="text-secondary" style="font-size:.8rem">${scorePct}% coverage · ${s.vlmTierUsed ?? '—'}</div>
          ${missed.length ? `<div class="text-secondary" style="font-size:.75rem; margin-top:.2rem">Missed: ${missed.join(', ')}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
