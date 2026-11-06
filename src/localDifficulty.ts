// Per-client difficulty. Deliberately NOT shared: there is no room metadata,
// no OBR broadcast and no GM/player split. Each person types the number they
// need for their own roll; leaving it empty means "only resolve Hope / Fear".
const LS_KEY = 'dh_local_difficulty_v1';
const listeners = new Set<(v: number | null) => void>();

function read(): number | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw == null || raw === '') return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

let value: number | null = read();

export function getLocalDifficulty(): number | null { return value; }

export function setLocalDifficulty(v: number | null) {
  const next = v != null && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (next === value) return;
  value = next;
  try {
    if (next == null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, String(next));
  } catch { /* memory only */ }
  for (const f of [...listeners]) {
    try { f(next); } catch { /* ignore */ }
  }
}

export function onLocalDifficulty(cb: (v: number | null) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
