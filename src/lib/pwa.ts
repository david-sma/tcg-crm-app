/** Shared PWA display-mode / platform detection (used by install + push prompts). */

/** True when running as an installed app (Chrome/Android installed PWA or iOS Home Screen app). */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/** True on iPhone/iPad/iPod (Safari or Home Screen app). */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

/** True on Android browsers (Chrome installed app or tab). */
export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /android/.test(window.navigator.userAgent.toLowerCase());
}

/** True when the user is on a phone we support push on (Android or iPhone). */
export function isSupportedPhone(): boolean {
  return isIOSDevice() || isAndroidDevice();
}

/** True when a banner with this key was dismissed within the last `days` days. */
export function isDismissed(key: string, days: number = 7): boolean {
  if (typeof window === 'undefined') return false;
  const dismissedAt = localStorage.getItem(key);
  if (!dismissedAt) return false;
  return (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24) < days;
}

/** Remember a banner dismissal (re-shows after `days` days). */
export function dismiss(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, Date.now().toString());
}
