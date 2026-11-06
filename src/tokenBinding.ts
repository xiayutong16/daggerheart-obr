// Bind an Owlbear scene item (a character / monster token, i.e. an "avatar") to
// one adversary from the compendium, then show a compact stat card.
//
// The binding lives in the item's `metadata`, so it is saved with the scene and
// follows the token when it is copied, moved or re-opened on another device.
// Only the GM ever sees the context-menu icons; the card itself is a floating
// Owlbear popover that opens automatically when the GM left-clicks a bound
// token and can be dragged anywhere on screen.
import OBR from '@owlbear-rodeo/sdk';
import type { Item } from '@owlbear-rodeo/sdk';
import type { Role } from './types';

export const EXT_ID = 'com.daggerheart-obr/bestiary';
export const META_KEY = `${EXT_ID}/token`;
export const MENU_BIND = `${EXT_ID}/menu-bind`;
export const PICKER_ID = `${EXT_ID}/picker`;
export const CARD_ID = `${EXT_ID}/card`;
export const BOOK_MODAL_ID = `${EXT_ID}/book-modal`;
export const CARD_CHANNEL = `${EXT_ID}/card`;
export const CARD_TARGET_KEY = 'dh_bestiary_card_target_v1';
export const CARD_POS_KEY = 'dh_bestiary_card_pos_v1';
export const CARD_W = 390;
export const CARD_H = 580;

export interface Binding {
  enemyId: string;
  hp: number;
  stress: number;
}
export interface BoundToken {
  itemId: string;
  name: string;
  binding: Binding;
}
export interface CardTarget {
  itemId: string;
  enemyId: string;
  name: string;
}
export interface CardPos { left: number; top: number }
export type CardMessage =
  | { type: 'switch'; target: CardTarget }
  | { type: 'closed' };

// ---------- URLs ----------
// Owlbear can proxy extension iframes, so `location.origin` inside the iframe is
// not a trustworthy base. Everything handed back to Owlbear (popover/modal urls,
// context-menu icons) must be the published absolute URL — same lesson as the
// manifest's icon/popover fields.
export const PUBLISHED_BASE = 'https://xiayutong16.github.io/daggerheart-obr/bestiary/';
function pageUrl(): string {
  return OBR.isAvailable
    ? `${PUBLISHED_BASE}index.html`
    : new URL(location.pathname, location.origin).toString();
}
/** Absolute url of this very page with a fresh query string. */
export function viewUrl(params: Record<string, string | undefined> = {}): string {
  const u = new URL(pageUrl());
  u.search = '';
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}
/** The card iframe always has this exact url, so re-opening it to move the
 * window never reloads the document (and never loses the drag / HP state). */
export function cardUrl(): string { return viewUrl({ mode: 'card' }); }
export function iconUrl(file: string): string {
  return new URL(file, PUBLISHED_BASE).toString();
}

// ---------- shared state (same origin: all extension iframes + previews) ----------
const LOCAL_KEY = 'dh_bestiary_bindings_v1';
const LOCAL_NAME_KEY = 'dh_bestiary_item_names_v1';
const BC_BINDINGS = 'dh-bestiary-bindings';
let memBindings: Record<string, Binding> = {};
let memNames: Record<string, string> = {};
let notifyChannel: BroadcastChannel | null = null;

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...fallback, ...parsed };
    }
  } catch { /* storage blocked inside some iframes */ }
  return { ...fallback };
}
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory only */ }
  try {
    if (!notifyChannel) notifyChannel = new BroadcastChannel(BC_BINDINGS);
    notifyChannel.postMessage('changed');
  } catch { /* BroadcastChannel unavailable */ }
}
function localBindings(): Record<string, Binding> {
  memBindings = readStore(LOCAL_KEY, memBindings);
  return memBindings;
}
function localNames(): Record<string, string> {
  memNames = readStore(LOCAL_NAME_KEY, memNames);
  return memNames;
}
export function rememberItemName(itemId: string, name: string) {
  if (!name) return;
  const names = localNames();
  names[itemId] = name;
  writeStore(LOCAL_NAME_KEY, names);
}
// These two are pure view state: writing them must NOT broadcast a "bindings
// changed" event, or dragging the card would redraw every open panel.
export function setCardTarget(t: CardTarget) {
  try { localStorage.setItem(CARD_TARGET_KEY, JSON.stringify(t)); } catch { /* memory only */ }
}
export function getCardTarget(): CardTarget | null {
  try {
    const raw = localStorage.getItem(CARD_TARGET_KEY);
    if (raw) {
      const t = JSON.parse(raw) as CardTarget;
      if (t && typeof t.itemId === 'string' && typeof t.enemyId === 'string') return t;
    }
  } catch { /* ignore */ }
  return null;
}
export function setCardPos(p: CardPos) {
  try { localStorage.setItem(CARD_POS_KEY, JSON.stringify(p)); } catch { /* memory only */ }
}
export function getCardPos(): CardPos | null {
  try {
    const raw = localStorage.getItem(CARD_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as CardPos;
      if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

// ---------- reading / writing bindings ----------
export function readBinding(item?: Item): Binding | null {
  if (!item) return null;
  const raw = item.metadata?.[META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<Binding>;
  if (typeof b.enemyId !== 'string') return null;
  return {
    enemyId: b.enemyId,
    hp: Number.isFinite(Number(b.hp)) ? Number(b.hp) : 0,
    stress: Number.isFinite(Number(b.stress)) ? Number(b.stress) : 0,
  };
}

export async function getBinding(itemId: string): Promise<Binding | null> {
  if (!OBR.isAvailable) return localBindings()[itemId] ?? null;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return readBinding(items[0]);
  } catch { return null; }
}

export async function setBinding(itemId: string, binding: Binding | null): Promise<void> {
  if (!OBR.isAvailable) {
    const all = localBindings();
    if (binding) all[itemId] = binding;
    else delete all[itemId];
    writeStore(LOCAL_KEY, all);
    return;
  }
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      if (binding) it.metadata[META_KEY] = { ...binding };
      else delete it.metadata[META_KEY];
    }
  });
}

export async function adjustBinding(
  itemId: string,
  field: 'hp' | 'stress',
  delta: number,
  max: number,
): Promise<Binding | null> {
  if (!OBR.isAvailable) {
    const cur = localBindings()[itemId];
    if (!cur) return null;
    const next: Binding = { ...cur, [field]: Math.max(0, Math.min(max, cur[field] + delta)) };
    await setBinding(itemId, next);
    return next;
  }
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      const b = readBinding(it as Item);
      if (!b) continue;
      it.metadata[META_KEY] = { ...b, [field]: Math.max(0, Math.min(max, b[field] + delta)) };
    }
  });
  return getBinding(itemId);
}

export async function listBoundTokens(): Promise<BoundToken[]> {
  if (!OBR.isAvailable) {
    const names = localNames();
    return Object.entries(localBindings()).map(([itemId, binding]) => ({
      itemId,
      name: names[itemId] || `头像 ${itemId.slice(0, 6)}`,
      binding,
    }));
  }
  try {
    const items = await OBR.scene.items.getItems();
    const out: BoundToken[] = [];
    for (const item of items) {
      const binding = readBinding(item);
      if (binding) out.push({ itemId: item.id, name: item.name || '未命名头像', binding });
    }
    return out;
  } catch { return []; }
}

/** Fires whenever scene items change (or the local fallback store changes). */
export function onBindingsChange(cb: () => void): () => void {
  if (!OBR.isAvailable) {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(BC_BINDINGS);
      ch.onmessage = () => cb();
    } catch { /* no cross-tab channel */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }
  return OBR.scene.items.onChange(() => cb());
}

// ---------- card messages between extension iframes ----------
function broadcastCard(payload: CardMessage) {
  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(CARD_CHANNEL, payload, { destination: 'LOCAL' }).catch(() => {});
    }
  } catch { /* ignore */ }
  try {
    const ch = new BroadcastChannel(CARD_CHANNEL);
    ch.postMessage(payload);
    setTimeout(() => ch.close(), 250);
  } catch { /* ignore */ }
}
export function startCardMessages(cb: (m: CardMessage) => void) {
  const deliver = (raw: unknown) => {
    const m = raw as CardMessage | undefined;
    if (m && typeof m === 'object' && (m.type === 'switch' || m.type === 'closed')) cb(m);
  };
  if (OBR.isAvailable) {
    const wire = () => {
      try { OBR.broadcast.onMessage(CARD_CHANNEL, ev => deliver(ev.data)); } catch { /* ignore */ }
    };
    if (OBR.isReady) wire(); else OBR.onReady(wire);
  }
  try {
    const ch = new BroadcastChannel(CARD_CHANNEL);
    ch.onmessage = ev => deliver(ev.data);
  } catch { /* ignore */ }
}

// ---------- popups ----------
export async function openPicker(itemId: string, current?: string, hint = false, itemName?: string): Promise<void> {
  if (!OBR.isAvailable) return;
  await OBR.modal.open({
    id: PICKER_ID,
    url: viewUrl({ mode: 'picker', item: itemId, current, name: itemName, hint: hint ? '1' : undefined }),
    width: 620,
    height: 660,
  });
}
export async function closePicker(): Promise<void> {
  if (!OBR.isAvailable) return;
  try { await OBR.modal.close(PICKER_ID); } catch { /* not open */ }
}

async function defaultCardPos(): Promise<CardPos> {
  try {
    const w = await OBR.viewport.getWidth();
    const h = await OBR.viewport.getHeight();
    return {
      left: Math.max(16, w - CARD_W - 26),
      top: Math.max(16, Math.min(110, h - CARD_H - 20)),
    };
  } catch { return { left: 900, top: 110 }; }
}

let cardOpen = false;

function openCardPopover(pos: CardPos): Promise<void> {
  return OBR.popover.open({
    id: CARD_ID,
    url: cardUrl(),
    width: CARD_W,
    height: CARD_H,
    anchorReference: 'POSITION',
    anchorPosition: pos,
    hidePaper: true,
    disableClickAway: true,
  });
}

/** Open the floating card, or switch its contents if it is already open. */
export async function showCardFor(itemId: string, enemyId: string, itemName?: string): Promise<void> {
  if (!OBR.isAvailable) return;
  const target: CardTarget = { itemId, enemyId, name: itemName || '' };
  setCardTarget(target);
  const pos = getCardPos() ?? await defaultCardPos();
  setCardPos(pos);
  if (cardOpen) broadcastCard({ type: 'switch', target });
  cardOpen = true;
  // Always re-assert the popover: if Owlbear closed it behind our back (scene
  // change, popover reset) the card would otherwise never come back. Same id
  // and same url means the iframe is reused rather than reloaded.
  await openCardPopover(pos);
}

/** Kept for the compendium panel's "打开怪物卡" link. */
export const openCard = showCardFor;

/** Re-open the same popover at a new anchor — this is how the GM drags the card. */
export async function moveCard(left: number, top: number): Promise<void> {
  const pos = { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)) };
  setCardPos(pos);
  if (!OBR.isAvailable) return;
  await openCardPopover(pos);
}
/** One-click docking, a reliable fallback if live dragging feels jumpy. */
export async function dockCard(corner: 'tl' | 'tr' | 'bl' | 'br'): Promise<void> {
  let w = 1200;
  let h = 800;
  if (OBR.isAvailable) {
    try {
      w = await OBR.viewport.getWidth();
      h = await OBR.viewport.getHeight();
    } catch { /* use defaults */ }
  } else {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  const left = corner === 'tr' || corner === 'br' ? Math.max(8, w - CARD_W - 18) : 18;
  const top = corner === 'bl' || corner === 'br' ? Math.max(8, h - CARD_H - 18) : 18;
  await moveCard(left, top);
}
export async function closeCard(): Promise<void> {
  if (!OBR.isAvailable) return;
  try { await OBR.popover.close(CARD_ID); } catch { /* not open */ }
  broadcastCard({ type: 'closed' });
}
export async function openBookModal(): Promise<void> {
  if (!OBR.isAvailable) return;
  await OBR.modal.open({ id: BOOK_MODAL_ID, url: viewUrl({ mode: 'book' }), width: 620, height: 780 });
}

// ---------- right-click menu (binding only; viewing is now left-click) ----------
/**
 * Registered from this extension's popover iframe. Owlbear keeps the iframe
 * alive while the extension is installed, so the icons are available even when
 * the compendium panel itself is closed.
 */
export async function setupContextMenu(role: Role): Promise<void> {
  if (!OBR.isAvailable || role !== 'GM') return;
  const base = { roles: ['GM'] as ('GM' | 'PLAYER')[], max: 1 };
  await OBR.contextMenu.create({
    id: MENU_BIND,
    icons: [
      {
        icon: iconUrl('./bind.svg'),
        label: '绑定怪物图鉴',
        filter: { ...base, every: [{ key: ['metadata', META_KEY], value: undefined }] },
      },
      { icon: iconUrl('./swap.svg'), label: '更换 / 解除绑定', filter: base },
    ],
    onClick: async (context) => {
      const item = context.items[0];
      if (!item) return;
      await openPicker(item.id, readBinding(item)?.enemyId, false, item.name);
    },
  });
}

/**
 * Left-clicking a bound token opens its card automatically. Selection changes
 * fire while dragging too, so repeated events for the same item are ignored.
 */
export function startAutoCard(role: Role): void {
  if (!OBR.isAvailable || role !== 'GM') return;
  let autoStarted = false;
  const wire = () => {
    if (autoStarted) return;
    autoStarted = true;
    let lastSelected: string | null = null;
    try {
      OBR.player.onChange((player) => {
        const sel = player.selection ?? [];
        if (sel.length !== 1) { lastSelected = null; return; }
        const itemId = sel[0];
        if (lastSelected === itemId) return;
        lastSelected = itemId;
        void (async () => {
          try {
            const items = await OBR.scene.items.getItems([itemId]);
            const item = items[0];
            if (!item) return;
            const binding = readBinding(item);
            if (!binding) return;
            await showCardFor(item.id, binding.enemyId, item.name || '未命名头像');
          } catch { /* ignore transient selection errors */ }
        })();
      });
    } catch { /* ignore */ }
    try {
      OBR.broadcast.onMessage(CARD_CHANNEL, (ev) => {
        const m = ev.data as CardMessage | undefined;
        if (m?.type === 'closed') cardOpen = false;
      });
    } catch { /* ignore */ }
    try {
      const ch = new BroadcastChannel(CARD_CHANNEL);
      ch.onmessage = (ev) => {
        const m = ev.data as CardMessage | undefined;
        if (m?.type === 'closed') cardOpen = false;
      };
    } catch { /* ignore */ }
  };
  if (OBR.isReady) wire(); else OBR.onReady(wire);
}
