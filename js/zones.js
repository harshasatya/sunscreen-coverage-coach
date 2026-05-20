/**
 * @module zones
 * @description Loads zones.json and provides fast zone/pair lookup utilities.
 * Zones are keyed by id after first load for O(1) access.
 */

let _zoneData  = null;
let _zoneIndex = null; // { [id]: zone }

/**
 * Loads and caches zones.json. Safe to call multiple times.
 * @returns {Promise<{zones: object[], pairs: string[][]}>}
 */
export async function loadZones() {
  if (_zoneData) return _zoneData;
  const res = await fetch('./data/zones.json');
  _zoneData  = await res.json();
  _zoneIndex = Object.fromEntries(_zoneData.zones.map((z) => [z.id, z]));
  return _zoneData;
}

/**
 * @param {string} id
 * @returns {object|null}
 */
export function getZone(id) {
  return _zoneIndex?.[id] ?? null;
}

/**
 * Returns all zones.
 * @returns {object[]}
 */
export function getAllZones() {
  return _zoneData?.zones ?? [];
}

/**
 * Returns the pairs array: [[leftId, rightId], ...].
 * @returns {string[][]}
 */
export function getPairs() {
  return _zoneData?.pairs ?? [];
}

/**
 * Given one zone id, returns its paired zone id (or null if unpaired).
 * @param {string} zoneId
 * @returns {string|null}
 */
export function getPair(zoneId) {
  for (const [a, b] of getPairs()) {
    if (a === zoneId) return b;
    if (b === zoneId) return a;
  }
  return null;
}
