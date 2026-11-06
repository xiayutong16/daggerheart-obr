// Bind an Owlbear scene item (a character / monster token, i.e. an "avatar") to
// one adversary from the compendium, then open a compact stat card from the GM's
// right-click menu.
//
// The binding lives in the item's `metadata`, so it is saved with the scene and
// follows the token when it is copied, moved to another scene or re-opened on a
// different device. Only the GM ever sees the context-menu icons.
import OBR from '@owlbear-rodeo/sdk';
import type { Item } from '@owlbear-rodeo/sdk';
import type { Role } from './types';

export const EXT_ID = 'com.daggerheart-obr/bestiary';
export const META_KEY = `${EXT_ID}/token`;
export const MENU_BIND = `${EXT_ID}/menu-bind`;
export const MENU_CARD = `${EXT_ID}/menu-card`;
export const PICKER_ID = `${EXT_ID}/picker`;
export const CARD_ID = `${EXT_ID}/card`;
export const BOOK_MODAL_ID = `${EXT_ID}/book-modal`;

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
/** Absolute url for a context-menu icon served next to the extension html. */
export function iconUrl(file: string): string {
  return new URL(file, PUBLISHED_BASE).toString();
}

// ---------- local fallback (browser preview outside Owlbear) ----------
const LOCAL_KEY = 'dh_bestiary_bindings_v1';
const LOCAL_NAME_KEY = 'dh_bestiary_item_names_v1';
const BC_NAME = 'dh-bestiary-bindings';
let memBindings: Record<string, Binding> = {};
let memNames: Record<string, string> = {};

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
function localBindings(): Record<string, Binding> {
  memBindings = readStore(LOCAL_KEY, memBindings);
  return memBindings;
}
function localNames(): Record<string, string> {
  memNames = readStore(LOCAL_NAME_KEY, memNames);
  return memNames;
}
let notifyChannel: BroadcastChannel | null = null;
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory only */ }
  try {
    // Keep one channel alive: closing it immediately after postMessage can drop
    // the delivery in some browsers.
    if (!notifyChannel) notifyChannel = new BroadcastChannel(BC_NAME);
    notifyChannel.postMessage('changed');
  } catch { /* BroadcastChannel unavailable */ }
}
export function rememberItemName(itemId: string, name: string) {
  if (!name) return;
  const names = localNames();
  names[itemId] = name;
  writeStore(LOCAL_NAME_KEY, names);
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
  } catch {
    return null;
  }
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
  } catch {
    return [];
  }
}

/** Fires whenever scene items change (or the local fallback store changes). */
export function onBindingsChange(cb: () => void): () => void {
  if (!OBR.isAvailable) {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(BC_NAME);
      ch.onmessage = () => cb();
    } catch { /* no cross-tab channel */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }
  return OBR.scene.items.onChange(() => cb());
}

// ---------- popups ----------
export async function openPicker(
  itemId: string,
  current?: string,
  hint = false,
  itemName?: string,
): Promise<void> {
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
export async function openCard(
  itemId: string,
  enemyId: string,
  itemName?: string,
  anchorElementId?: string,
): Promise<void> {
  if (!OBR.isAvailable) return;
  try { await OBR.popover.close(CARD_ID); } catch { /* not open */ }
  await OBR.popover.open({
    id: CARD_ID,
    url: viewUrl({ mode: 'card', item: itemId, enemy: enemyId, name: itemName }),
    width: 390,
    height: 580,
    ...(anchorElementId ? { anchorElementId } : {}),
  });
}
export async function closeCard(): Promise<void> {
  if (!OBR.isAvailable) return;
  try { await OBR.popover.close(CARD_ID); } catch { /* not open */ }
}
export async function openBookModal(): Promise<void> {
  if (!OBR.isAvailable) return;
  await OBR.modal.open({
    id: BOOK_MODAL_ID,
    url: viewUrl({ mode: 'book' }),
    width: 620,
    height: 780,
  });
}

// ---------- right-click menu ----------
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
        // First icon: only when this token has no binding yet.
        filter: {
          ...base,
          every: [{ key: ['metadata', META_KEY], value: undefined }],
        },
      },
      {
        icon: iconUrl('./swap.svg'),
        label: '更换 / 解除绑定',
        filter: base,
      },
    ],
    onClick: async (context) => {
      const item = context.items[0];
      if (!item) return;
      const binding = readBinding(item);
      await openPicker(item.id, binding?.enemyId, false, item.name);
    },
  });

  await OBR.contextMenu.create({
    id: MENU_CARD,
    icons: [{ icon: iconUrl('./card.svg'), label: '查看怪物卡', filter: base }],
    onClick: async (context, elementId) => {
      const item = context.items[0];
      if (!item) return;
      const binding = readBinding(item);
      if (!binding) {
        // No filter on this icon on purpose: a GM who clicks "view" on an
        // unbound token is taken straight to the picker instead of a dead end.
        await openPicker(item.id, undefined, true, item.name);
        return;
      }
      await openCard(item.id, binding.enemyId, item.name, elementId);
    },
  });
}
