// Tiny haptics helper. navigator.vibrate exists on Android Chrome/Firefox; iOS Safari has none, so this is a no-op there.
// Skipped entirely when the user prefers reduced motion. No UI of its own.
export const PATTERNS = {
  select: [8],
  start: [12],
  go: [20, 40, 20],
  win: [30, 50, 30, 50, 60],
  lose: [60],
  tap: [6],
} as const;
export type Buzz = keyof typeof PATTERNS;
export function buzz(kind: Buzz) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Chrome blocks (and logs) vibrate before the user has tapped the page at least once; skip quietly instead.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate([...PATTERNS[kind]]);
  } catch { /* some browsers throw before a user gesture; haptics are never worth an error */ }
}
