"use client";
// Alerts while the app is open (or in a background tab): siren sound + system notification.
// When the app is closed, alerts come through Telegram instead (websites can't play custom sounds then).
let audio: HTMLAudioElement | null = null;
let unlocked = false;

export function unlockSound() {
  if (unlocked || typeof window === "undefined") return;
  audio = audio || new Audio("/siren.mp3");
  audio.muted = true;
  audio.play().then(() => { audio!.pause(); audio!.currentTime = 0; audio!.muted = false; unlocked = true; }).catch(() => { audio!.muted = false; });
}
export function siren() {
  try { audio = audio || new Audio("/siren.mp3"); audio.currentTime = 0; audio.volume = 1; void audio.play(); } catch { /* blocked until the first tap */ }
  try { navigator.vibrate?.([400, 120, 400, 120, 800]); } catch { /* not supported */ }
}
export const notifySupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
export const notifyPermission = () => (notifySupported() ? Notification.permission : "denied");
export async function askNotify(): Promise<NotificationPermission> { return notifySupported() ? Notification.requestPermission() : "denied"; }
export async function registerSW() { if ("serviceWorker" in navigator) { try { await navigator.serviceWorker.register("/sw.js"); } catch { /* ignore */ } } }
export async function notify(title: string, body: string, tag: string, url = "/") {
  if (notifyPermission() !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", requireInteraction: true, data: { url },
      ...({ renotify: true, vibrate: [400, 120, 400, 120, 800] } as object) });
  } catch { /* notification failed; the in-app alert still shows */ }
}
export function alertEntry(opts: { title: string; body: string; tag: string; sound: boolean; push: boolean }) {
  if (opts.sound) siren();
  if (opts.push) void notify(opts.title, opts.body, opts.tag);
}
