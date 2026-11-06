// Bridge between the standalone character-card workshop (/card/) and the
// character sheet inside the main Owlbear extension.
//
// The two pages share an origin on GitHub Pages, so localStorage and
// BroadcastChannel usually work. Owlbear iframes can silently refuse storage,
// so we ALSO send a LOCAL broadcast (reaches every extension on this client)
// and always offer a copy/paste import code as a 100% reliable fallback.
import OBR from '@owlbear-rodeo/sdk';
import type { CharData } from './types';
import { TRAITS, CLASSES } from './data/classes';

export const CHAR_KEY = 'dh_char_v1';
export const CHAR_CHANNEL = 'com.daggerheart-obr/char-sync';
const BC_NAME = 'com.daggerheart-obr/char-sync';
const CODE_PREFIX = 'DH1:';

interface CharMessage { type: 'char'; data: CharData; ts: number }

function num(v: unknown, fallback = 0, min = 0, max = 99): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, 120) : fallback;
}
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(x => typeof x === 'string').map(x => (x as string).slice(0, 120)).slice(0, 20);
}

/** Normalise anything (old saves, pasted JSON, remote payloads) into CharData. */
export function normalizeChar(raw: unknown): CharData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<CharData>;
  const traits: Record<string, number> = {};
  for (const t of TRAITS) traits[t.zh] = num(d.traits?.[t.zh], 0, -9, 20);
  const classZh = str(d.classZh, CLASSES[0].zh);
  const hpMax = num(d.hpMax, 5, 0, 99);
  const stressMax = num(d.stressMax, 6, 0, 99);
  const armorMax = num(d.armorMax, 3, 0, 99);
  return {
    name: str(d.name),
    ancestry: str(d.ancestry),
    community: str(d.community),
    classZh,
    subclass: str(d.subclass),
    traits,
    hp: num(d.hp, hpMax),
    hpMax,
    stress: num(d.stress, 0),
    stressMax,
    evasion: num(d.evasion, 10),
    armor: num(d.armor, armorMax),
    armorMax,
    proficiency: num(d.proficiency, 1, 0, 6),
    hope: num(d.hope, 0, 0, 6),
    fear: num(d.fear, 0, 0, 12),
    thresholds: str(d.thresholds, '8 / 16'),
    experiences: strList(d.experiences),
    domainCards: strList(d.domainCards),
  };
}

// ---------- paste-able import code (UTF-8 safe base64url) ----------
export function encodeCharCode(d: CharData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeCharCode(code: string): CharData | null {
  const raw = (code || '').trim();
  if (!raw.startsWith(CODE_PREFIX)) return null;
  try {
    let b64 = raw.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return normalizeChar(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

// ---------- shared local storage ----------
export function readLocalChar(): CharData | null {
  try {
    const raw = localStorage.getItem(CHAR_KEY);
    if (!raw) return null;
    return normalizeChar(JSON.parse(raw));
  } catch { return null; }
}
export function writeLocalChar(d: CharData): boolean {
  try {
    localStorage.setItem(CHAR_KEY, JSON.stringify(d));
    return true;
  } catch { return false; }
}

// ---------- publish / subscribe ----------
/** Called by the workshop: write the sheet and tell the Owlbear extension. */
export function publishChar(d: CharData): { stored: boolean } {
  const stored = writeLocalChar(d);
  const msg: CharMessage = { type: 'char', data: d, ts: Date.now() };
  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(CHAR_CHANNEL, msg, { destination: 'LOCAL' }).catch(() => {});
    }
  } catch { /* ignore */ }
  try {
    const ch = new BroadcastChannel(BC_NAME);
    ch.postMessage(msg);
    setTimeout(() => ch.close(), 250);
  } catch { /* ignore */ }
  return { stored };
}

/** Called by the main extension at start-up. */
export function startCharSync(cb: (d: CharData) => void): void {
  const deliver = (raw: unknown) => {
    const m = raw as CharMessage | undefined;
    if (!m || m.type !== 'char') return;
    const d = normalizeChar(m.data);
    if (!d) return;
    writeLocalChar(d);
    cb(d);
  };
  if (OBR.isAvailable) {
    const wire = () => {
      try { OBR.broadcast.onMessage(CHAR_CHANNEL, ev => deliver(ev.data)); } catch { /* ignore */ }
    };
    if (OBR.isReady) wire(); else OBR.onReady(wire);
  }
  try {
    const ch = new BroadcastChannel(BC_NAME);
    ch.onmessage = ev => deliver(ev.data);
  } catch { /* ignore */ }
}
