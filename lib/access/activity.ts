/**
 * Ongoing-activity notification (W3): one persistent, tag-replaced web
 * notification for a running activity, shown through the existing service
 * worker registration so its `notificationclick` handler (public/sw.js) focuses
 * or opens `data.url`. Callers update it on a PHASE change only — never per tick.
 */
export const ACTIVITY_TAG = 'rmh-activity';

export function activityNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function showActivity(opts: { title: string; body: string; url: string }) {
  if (!activityNotificationsSupported() || Notification.permission !== 'granted') return;
  const reg = await registration();
  if (!reg) return;
  await reg.showNotification(opts.title, {
    body: opts.body,
    tag: ACTIVITY_TAG,
    icon: '/images/icons/icon-192.png',
    silent: true,
    requireInteraction: true,
    data: { url: opts.url },
  });
}

export async function clearActivity() {
  if (!activityNotificationsSupported()) return;
  const reg = await registration();
  if (!reg) return;
  for (const n of await reg.getNotifications({ tag: ACTIVITY_TAG })) n.close();
}
