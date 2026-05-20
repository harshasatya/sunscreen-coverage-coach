/**
 * @module scheduler
 * @description Manages reapplication reminder notifications.
 * Prefers the Notifications API + setTimeout for in-session reminders.
 * Service-worker-based push notifications are a Phase 5 enhancement.
 */

let _reminderTimeout = null;

/**
 * Requests notification permission if not already granted.
 * @returns {Promise<NotificationPermission>}
 */
export async function requestPermission() {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Schedules a reapplication reminder.
 * @param {number}  minutesFromNow  - base interval; adjusted down when UV is high
 * @param {object}  [options]
 * @param {string}  [options.title]
 * @param {string}  [options.body]
 * @param {number}  [options.uvReapplyFactor=1] - from UV_DESCRIPTIONS; >1 = sooner
 * @returns {Promise<void>}
 */
export async function scheduleReminder(minutesFromNow, options = {}) {
  cancelReminder();
  const perm   = await requestPermission();
  const factor = options.uvReapplyFactor ?? 1;
  const adjusted = Math.round(minutesFromNow / factor);
  const ms    = adjusted * 60 * 1000;
  const title = options.title ?? 'Time to reapply!';
  const body  = options.body  ?? `${adjusted} min have passed. Reapply your sunscreen.`;

  _reminderTimeout = setTimeout(() => {
    if (perm === 'granted') {
      new Notification(title, { body, icon: './assets/icons/icon-192.png' });
    } else {
      alert(body);
    }
  }, ms);

  console.log(`[scheduler] Reminder set for ${adjusted} min (base ${minutesFromNow}, UV factor ${factor})`);
  return adjusted;
}

/** Cancels any pending reminder. */
export function cancelReminder() {
  if (_reminderTimeout !== null) {
    clearTimeout(_reminderTimeout);
    _reminderTimeout = null;
  }
}
