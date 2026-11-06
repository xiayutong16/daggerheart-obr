// Bridge between the GM bestiary extension and the main dice panel.
//
// Both extensions are loaded from the same origin inside Owlbear, so a LOCAL
// broadcast reaches the other extension on this machine without ever reaching
// the players. A BroadcastChannel is used alongside it (same-origin iframes,
// plus plain-browser previews), and every message carries an id so the two
// channels can never create a duplicate queue entry.
import OBR from '@owlbear-rodeo/sdk';

export const QUICK_CHANNEL = 'com.daggerheart-obr/quick-rolls';
const BC_NAME = 'com.daggerheart-obr/quick-rolls';
const LS_KEY = 'dh_quick_rolls_v1';
const MAX = 12;

export interface DamageDice {
  count: number;      // number of damage dice (0 for flat damage)
  sides: number;      // 0 for flat damage
  modifier: number;   // +3 in "1d8+3"
  flat: number;       // "7点 物理" with no die
  type: string;       // 物理 / 魔法
}
export interface QuickRoll {
  id: string;
  ts: number;
  source: string;     // e.g. 持弓警卫 · 长弓
  kind: 'attack' | 'damage';
  label: string;      // e.g. 命中 +1 / 1d8+3 物理
  bonus?: number;     // attack bonus
  dice?: DamageDice;  // damage formula
}
type Payload =
  | { type: 'add'; roll: QuickRoll }
  | { type: 'remove'; id: string }
  | { type: 'clear' };

function load(): QuickRoll[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(x => x && typeof x.id === 'string').slice(0, MAX);
    }
  } catch { /* storage blocked */ }
  return [];
}
let rolls: QuickRoll[] = load();
const listeners = new Set<() => void>();
let started = false;
let tabChannel: BroadcastChannel | null = null;

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rolls)); } catch { /* memory only */ }
}
function notify() {
  for (const f of [...listeners]) {
    try { f(); } catch { /* ignore */ }
  }
}
export function getQuickRolls(): QuickRoll[] { return rolls; }
export function onQuickRollsChange(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function newQuickId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function add(roll: QuickRoll) {
  if (!roll || typeof roll.id !== 'string' || rolls.some(r => r.id === roll.id)) return;
  rolls = [roll, ...rolls].slice(0, MAX);
  save();
  notify();
}
export function removeQuickRoll(id: string) {
  rolls = rolls.filter(r => r.id !== id);
  save();
  notify();
  emit({ type: 'remove', id });
}
export function clearQuickRolls() {
  rolls = [];
  save();
  notify();
  emit({ type: 'clear' });
}

function apply(payload: Payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.type === 'add') add(payload.roll);
  else if (payload.type === 'remove') {
    if (rolls.some(r => r.id === payload.id)) {
      rolls = rolls.filter(r => r.id !== payload.id);
      save();
      notify();
    }
  } else if (payload.type === 'clear') {
    if (rolls.length) { rolls = []; save(); notify(); }
  }
}

function emit(payload: Payload) {
  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(QUICK_CHANNEL, payload, { destination: 'LOCAL' }).catch(() => {});
    }
  } catch { /* ignore */ }
  try {
    if (!tabChannel) tabChannel = new BroadcastChannel(BC_NAME);
    tabChannel.postMessage(payload);
  } catch { /* ignore */ }
}

/** Called by the bestiary: push an attack / damage formula into the dice panel. */
export function sendQuickRoll(roll: QuickRoll) {
  add(roll);
  emit({ type: 'add', roll });
}

/** Called once by the main extension at start-up. */
export function startQuickRolls() {
  if (started) return;
  started = true;
  try {
    if (OBR.isAvailable) {
      OBR.onReady(() => {
        try { OBR.broadcast.onMessage(QUICK_CHANNEL, ev => apply(ev.data as Payload)); } catch { /* ignore */ }
      });
    }
  } catch { /* ignore */ }
  try {
    tabChannel = new BroadcastChannel(BC_NAME);
    tabChannel.onmessage = ev => apply(ev.data as Payload);
  } catch { /* ignore */ }
}

// ---------- Daggerheart attack / damage formula parsing ----------

/**
 * "1d8+3 物理" → { count:1, sides:8, modifier:3, type:'物理' }
 * "7点 物理"  → flat damage with no dice (17 adversaries use this).
 */
export function parseDamage(text: string): DamageDice | null {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*(物理|魔法)?/i);
  if (m) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const sides = parseInt(m[2], 10);
    const modifier = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
    if (!Number.isFinite(count) || !Number.isFinite(sides) || count < 1 || sides < 2) return null;
    return { count, sides, modifier, flat: 0, type: m[4] || '' };
  }
  const fixed = s.match(/^(\d+)\s*点?\s*(物理|魔法)?/);
  if (fixed) {
    return { count: 0, sides: 0, modifier: 0, flat: parseInt(fixed[1], 10), type: fixed[2] || '' };
  }
  return null;
}

/** "+1" / "−1" (unicode minus) / "-4" → number */
export function parseBonus(text: string): number {
  if (!text) return 0;
  const n = parseInt((text || '').replace(/[−–—]/g, '-').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function damageFormula(d: DamageDice): string {
  if (!d.count) return `${d.flat}${d.type ? ' ' + d.type : ''}（固定伤害）`;
  const mod = d.modifier ? (d.modifier > 0 ? `+${d.modifier}` : `${d.modifier}`) : '';
  return `${d.count}d${d.sides}${mod}${d.type ? ' ' + d.type : ''}`;
}

/**
 * Daggerheart critical damage: roll the damage dice as usual, then ADD the
 * maximum possible result of those dice (one max per die). The modifier is
 * only applied once. e.g. 2d8+1 critical = 2d8 + 1 + 16.
 * Flat damage has no dice, so nothing extra is added.
 */
export function criticalExtra(d: DamageDice): number {
  return d.count * d.sides;
}
