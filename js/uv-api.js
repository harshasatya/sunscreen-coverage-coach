/**
 * @module uv-api
 * @description Fetches the current UV index from Open-Meteo (no API key required).
 * Endpoint: https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}
 *           &hourly=uv_index&timezone=auto&forecast_days=1
 */

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export const UV_DESCRIPTIONS = {
  low:      { range: [0, 2],  label: 'Low',       reapplyFactor: 1.0 },
  moderate: { range: [3, 5],  label: 'Moderate',  reapplyFactor: 1.0 },
  high:     { range: [6, 7],  label: 'High',      reapplyFactor: 1.2 },
  veryHigh: { range: [8, 10], label: 'Very High', reapplyFactor: 1.5 },
  extreme:  { range: [11, Infinity], label: 'Extreme', reapplyFactor: 2.0 },
};

/**
 * @typedef {Object} UVResult
 * @property {number} uvIndex
 * @property {string} description  - 'Low' | 'Moderate' | 'High' | 'Very High' | 'Extreme'
 * @property {number} reapplyFactor - multiplier to reduce reapply interval (>1 = sooner)
 */

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<UVResult>}
 */
export async function getCurrentUVIndex(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    hourly: 'uv_index', timezone: 'auto', forecast_days: 1,
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error(`UV fetch failed: ${res.status}`);
  const data = await res.json();
  const hourlyUV = data.hourly?.uv_index ?? [];
  const hour = new Date().getHours();
  const uvIndex = Math.round(hourlyUV[hour] ?? 0);
  return { uvIndex, ...describeUV(uvIndex) };
}

/**
 * Requests the user's current geolocation.
 * @returns {Promise<{lat:number, lon:number}>}
 */
export function requestGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000 }
    );
  });
}

/**
 * @param {number} uvIndex
 * @returns {{ description: string, reapplyFactor: number }}
 */
export function describeUV(uvIndex) {
  for (const key of Object.keys(UV_DESCRIPTIONS)) {
    const { range, label, reapplyFactor } = UV_DESCRIPTIONS[key];
    if (uvIndex >= range[0] && uvIndex <= range[1]) {
      return { description: label, reapplyFactor };
    }
  }
  return { description: 'Unknown', reapplyFactor: 1.0 };
}
