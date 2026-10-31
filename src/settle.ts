// Automatic Hope / Fear settlement after a duality roll.
// • Hope / critical → the rolling player gains Hope (cap 6).
// • Fear → the GM's Fear pool grows by one.
import { loadChar, saveChar } from './characterPanel';

export const HOPE_MAX = 6;
/** SRD: the GM can never hold more than 12 Fear at one time. */
export const FEAR_MAX = 12;

export interface SettleResult {
  before: number;
  after: number;
  gained: number;
  capped: boolean;
}

export function gainHope(n = 1): SettleResult {
  const d = loadChar();
  const before = d.hope ?? 0;
  d.hope = Math.min(HOPE_MAX, before + n);
  saveChar(d);
  return { before, after: d.hope, gained: d.hope - before, capped: d.hope >= HOPE_MAX };
}

export function getFear(): number {
  return Math.max(0, Math.min(FEAR_MAX, loadChar().fear ?? 0));
}

/** Set the GM's Fear pool, clamped to 0–12 as the SRD requires. */
export function setFear(value: number): SettleResult {
  const d = loadChar();
  const before = d.fear ?? 0;
  d.fear = Math.max(0, Math.min(FEAR_MAX, Math.round(value)));
  saveChar(d);
  return { before, after: d.fear, gained: d.fear - before, capped: d.fear >= FEAR_MAX };
}

export function gainFear(n = 1): SettleResult {
  return setFear(getFear() + n);
}

/** Persisted preference for automatic settlement. */
const KEY = 'dh_auto_settle';
export function autoSettleOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
export function setAutoSettle(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Persisted preference for casting dice onto the table. */
const TABLE_KEY = 'dh_table_dice';
export function tableDiceOn(): boolean {
  try {
    return localStorage.getItem(TABLE_KEY) !== '0';
  } catch {
    return true;
  }
}
export function setTableDice(on: boolean) {
  try {
    localStorage.setItem(TABLE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
