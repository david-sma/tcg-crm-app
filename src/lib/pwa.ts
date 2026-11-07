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
