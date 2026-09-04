// Global PWA install state. Imported once (side-effect) in main.jsx so the
// beforeinstallprompt listener attaches at load, before any menu mounts.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export const onInstallChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const canInstall = () => !!deferredPrompt;

export const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);

export async function triggerInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return true;
}
