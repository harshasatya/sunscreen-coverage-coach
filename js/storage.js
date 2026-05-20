/**
 * @module storage
 * @description Persistence layer. Wraps IndexedDB for session history
 * and localStorage for user settings. Defines Settings and Session data models.
 *
 * @typedef {Object} Settings
 * @property {string}  vlmTier              - 'gemma3n' | 'smolvlm' | 'claude' | 'heuristics'
 * @property {string|null} claudeApiKey     - API key for Tier 3 (claude)
 * @property {string}  gemmaModelSize       - 'e2b' | 'e4b'
 * @property {boolean} vlmModelDownloaded
 * @property {boolean} onboardingComplete
 * @property {boolean} notificationsEnabled
 * @property {number}  reapplyIntervalMinutes - default 120
 * @property {string}  skinTone             - Fitzpatrick: 'I'|'II'|'III'|'IV'|'V'|'VI'
 * @property {string}  sunscreenType        - 'mineral' | 'chemical' | 'hybrid'
 * @property {boolean} preciseModeEnabled
 *
 * @typedef {Object} ZoneScore
 * @property {number}   confidence  - 0.0–1.0
 * @property {string}   status      - 'covered' | 'partial' | 'missed'
 * @property {string[]} evidence    - e.g. ['asymmetric_specular', 'vlm_flagged']
 *
 * @typedef {Object} Session
 * @property {string}  id              - UUID
 * @property {number}  timestamp       - Unix ms
 * @property {string}  mode            - 'quick' | 'precise'
 * @property {string|null}  imageDataUrl    - captured face image (base64 JPEG)
 * @property {string|null}  baselineDataUrl
 * @property {{x:number,y:number,z:number}[]} landmarks - 478-point normalized array
 * @property {Object.<string, ZoneScore>} zoneScores
 * @property {string}  vlmTierUsed
 * @property {string|null} vlmRawResponse
 * @property {string|null} vlmNotes
 * @property {number|null} uvIndex
 * @property {string|null} reapplyAt   - ISO 8601
 */

const SETTINGS_KEY   = 'suncoach_settings';
const DB_NAME        = 'suncoach-db';
const DB_VERSION     = 1;
const STORE_SESSIONS = 'sessions';

const DEFAULT_SETTINGS = {
  vlmTier: null,
  claudeApiKey: null,
  gemmaModelSize: 'e2b',
  vlmModelDownloaded: false,
  onboardingComplete: false,
  notificationsEnabled: false,
  reapplyIntervalMinutes: 120,
  skinTone: 'III',
  sunscreenType: 'mineral',
  preciseModeEnabled: false,
};

// ─── Settings (localStorage) ──────────────────────────────────────────────────

/** @returns {Settings} */
export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** @param {Partial<Settings>} partial */
export function saveSettings(partial) {
  const current = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...partial }));
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────

/** @returns {Promise<IDBDatabase>} */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * @param {Session} session
 * @returns {Promise<void>}
 */
export async function saveSession(session) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * @param {number} [limit=20]
 * @returns {Promise<Session[]>}
 */
export async function getSessions(limit = 20) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const idx     = db.transaction(STORE_SESSIONS, 'readonly')
                      .objectStore(STORE_SESSIONS)
                      .index('timestamp');
    const results = [];
    const req     = idx.openCursor(null, 'prev'); // newest first

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} id
 * @returns {Promise<Session|null>}
 */
export async function getSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_SESSIONS, 'readonly')
                  .objectStore(STORE_SESSIONS).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** @returns {string} RFC 4122 v4 UUID */
export function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}
