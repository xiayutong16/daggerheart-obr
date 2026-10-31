// Table-wide roll log, kept in sync through Owlbear's broadcast API.
// Every normal roll is shared with the whole table. A GM's blind roll (暗骰) is
// recorded only on the GM's own client and never broadcast, so it shows up in the
// GM's list (marked with a lock) and in nobody else's.
import OBR from '@owlbear-rodeo/sdk';
import type { RollLogEntry, Role } from './types';

const CHANNEL = 'com.daggerheart-obr/rolls';
const MAX = 40;

export const rollLog: RollLogEntry[] = [];

let localRole: Role = 'GM';
let started = false;
const listeners = new Set<() => void>();

export function setLocalRole(role: Role) {
  localRole = role;
}

/** Drop every UI listener (call when the dice panel is torn down/rebuilt). */
export function resetRollLogListeners() {
  listeners.clear();
}

export function onRollLogChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  for (const f of listeners) f();
}

// Settlement hooks survive tab switches (they are wired once at start-up).
const remoteHandlers = new Set<(entry: RollLogEntry) => void>();

/** Called for every roll that arrives from another client (never for our own). */
export function onRemoteRoll(cb: (entry: RollLogEntry) => void) {
  remoteHandlers.add(cb);
  return () => {
    remoteHandlers.delete(cb);
  };
}

/** Returns true only when the entry is new, so reactions never run twice. */
function remember(entry: RollLogEntry): boolean {
  if (rollLog.some((e) => e.id === entry.id)) return false;
  rollLog.unshift(entry);
  while (rollLog.length > MAX) rollLog.pop();
  return true;
}

/** A roll that came from another client: dedupe first, then let everyone react. */
function receive(raw: unknown) {
  const entry = raw as RollLogEntry | undefined;
  if (!entry || typeof entry.id !== 'string') return;
  // Blind rolls are for the GM's eyes only.
  if (entry.gmOnly && localRole !== 'GM') return;
  // Broadcasts can arrive twice (resent / duplicate channel) — a Fear point must
  // never be counted twice, so the second copy is dropped here.
  if (!remember(entry)) return;
  notify();
  for (const h of remoteHandlers) {
    try {
      h(entry);
    } catch {
      /* ignore */
    }
  }
}

/** Local-preview-only channel so two browser tabs can act out a table. */
let tabChannel: BroadcastChannel | null = null;

/** Subscribe to remote rolls. Safe to call repeatedly — only wires up once. */
export function startRollLog() {
  if (started) return;
  started = true;

  if (OBR.isAvailable) {
    try {
      OBR.onReady(() => {
        OBR.broadcast.onMessage(CHANNEL, (event) => receive(event.data));
      });
    } catch {
      /* ignore */
    }
    return;
  }

  // Not inside Owlbear: sync between tabs of this browser instead, so a GM tab
  // and a player tab on one machine still settle Hope / Fear into each other.
  try {
    tabChannel = new BroadcastChannel(CHANNEL);
    tabChannel.onmessage = (ev) => receive(ev.data);
  } catch {
    tabChannel = null; // the log still works locally
  }
}

/** Append a roll and push it to the rest of the table. */
export function pushRoll(entry: RollLogEntry) {
  // A blind roll is written to the GM's own list only — it is never broadcast,
  // so the players' clients have no way of knowing it happened.
  remember(entry);
  notify();
  if (entry.gmOnly) return;

  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(CHANNEL, entry, { destination: 'REMOTE' }).catch(() => {});
    } else {
      tabChannel?.postMessage(entry);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Add the GM-side settlement result to an entry that arrived from a player
 * (e.g. "恐惧池 +1 → 7/12"). Only the GM's copy is touched.
 */
export function annotateRoll(
  id: string,
  patch: Partial<Pick<RollLogEntry, 'gmSettle'>>,
) {
  const entry = rollLog.find((e) => e.id === id);
  if (!entry) return;
  Object.assign(entry, patch);
  notify();
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
