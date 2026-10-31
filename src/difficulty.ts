// Shared difficulty (对抗难度) — the GM owns it, every player rolls against it.
//
// The GM's value is stored three ways so it survives whatever the host allows:
//   • room metadata  → authoritative, room-wide, survives a GM panel reopening
//   • live broadcast → instant push to everyone at the table
//   • localStorage   → local cache for single-device previews
// Players only ever read it; they can never set it.
import OBR from '@owlbear-rodeo/sdk';
import type { Role } from './types';

const KEY = 'com.daggerheart-obr/difficulty';
const CHANNEL = 'com.daggerheart-obr/difficulty';
const LS_KEY = 'dh_difficulty';

let value: number | null = readCache();
let started = false;
let tabChannel: BroadcastChannel | null = null;

type Payload = { type: 'set'; value: number | null } | { type: 'ask' };

const listeners = new Set<(v: number | null) => void>();

function readCache(): number | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw == null || raw === '') return null;
    return normalize(raw);
  } catch {
    return null;
  }
}

function writeCache(v: number | null) {
  try {
    if (v == null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, String(v));
  } catch {
    /* ignore */
  }
}

function normalize(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function emit() {
  for (const f of [...listeners]) {
    try {
      f(value);
    } catch {
      /* ignore */
    }
  }
}

function apply(next: number | null) {
  if (next === value) return;
  value = next;
  writeCache(next);
  emit();
}

/** The difficulty everyone rolls against (null = none set). */
export function getDifficulty(): number | null {
  return value;
}

/** Watch for GM changes — used by the player panel to show the live number. */
export function onDifficulty(cb: (v: number | null) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** GM only: publish a new difficulty (null clears it). */
export function setDifficulty(v: number | null) {
  const next = normalize(v);
  apply(next);
  const payload: Payload = { type: 'set', value: next };
  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' }).catch(() => {});
      // Authoritative copy: a player opening the panel later still sees it.
      OBR.room.setMetadata({ [KEY]: next }).catch(() => {});
    } else {
      tabChannel?.postMessage(payload);
    }
  } catch {
    /* ignore */
  }
}

function handle(payload: Payload | undefined, isGM: boolean) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.type === 'ask') {
    if (!isGM) return;
    // A player just opened their panel — tell them what the difficulty is.
    send({ type: 'set', value });
    return;
  }
  if (payload.type === 'set') apply(normalize(payload.value));
}

function send(payload: Payload) {
  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' }).catch(() => {});
    } else {
      tabChannel?.postMessage(payload);
    }
  } catch {
    /* ignore */
  }
}

function ask() {
  send({ type: 'ask' });
}

/** Wire up the room channel. Call once at start-up. */
export function startDifficulty(role: Role) {
  if (started) return;
  started = true;
  const isGM = role === 'GM';

  if (OBR.isAvailable) {
    try {
      OBR.onReady(async () => {
        try {
          const md = await OBR.room.getMetadata();
          if (md && KEY in md) apply(normalize(md[KEY]));
        } catch {
          /* metadata is optional */
        }
        try {
          OBR.broadcast.onMessage(CHANNEL, (ev) => handle(ev.data as Payload, isGM));
        } catch {
          /* ignore */
        }
        try {
          OBR.room.onMetadataChange((md) => {
            if (md && KEY in md) apply(normalize(md[KEY]));
          });
        } catch {
          /* ignore */
        }
        // Pull the current value in case the GM set it before we opened.
        if (!isGM) ask();
      });
    } catch {
      /* ignore */
    }
    return;
  }

  // Plain browser preview: sync between tabs of this browser.
  try {
    tabChannel = new BroadcastChannel(CHANNEL);
    tabChannel.onmessage = (ev) => handle(ev.data as Payload, isGM);
  } catch {
    tabChannel = null;
  }
  if (!isGM) ask();
}
