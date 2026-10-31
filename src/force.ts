// GM-only "指定点数" (rigged roll).
//
// The pending value is kept on the GM's own client — in localStorage when the
// environment allows it, otherwise in memory for the rest of the session — and is
// never broadcast. It is consumed by the next roll that contains a die with at
// least that many faces, so setting 20 makes the next d20 (or d100) come up 20
// while a d12 roll leaves the setting untouched.

const KEY = 'dh_force_value';

export const FORCE_MIN = 1;
export const FORCE_MAX = 100;

/** Source of truth for this session, so a blocked localStorage can't break it. */
let state: number | null | undefined; // undefined = not read yet
/** False once we learn the browser refuses to persist the value. */
let persisted = true;

function sanitize(raw: string | null): number | null {
  if (!raw) return null;
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < FORCE_MIN || v > FORCE_MAX) return null;
  return v;
}

function readStorage(): number | null {
  try {
    return sanitize(localStorage.getItem(KEY));
  } catch {
    persisted = false;
    return null;
  }
}

export function getForced(): number | null {
  if (state === undefined) state = readStorage();
  return state;
}

/** True when the pending value survives a reload on this machine. */
export function isPersisted(): boolean {
  return persisted;
}

export function setForced(v: number | null): boolean {
  state = v;
  try {
    if (v == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(v));
    // Verify — some iframes accept the call but silently drop the write.
    const back = sanitize(localStorage.getItem(KEY));
    persisted = v == null ? back === null : back === v;
  } catch {
    persisted = false;
  }
  return persisted;
}

/**
 * Claim the pending value for a roll whose biggest die has `maxSides` faces.
 * Returns null (and keeps the setting) when no die in this roll is big enough.
 */
export function takeForced(maxSides: number): number | null {
  const v = getForced();
  if (v == null) return null;
  if (maxSides < v) return null;
  setForced(null);
  return v;
}
