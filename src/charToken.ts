// Bind a player's character sheet to a scene token, then open it as a floating
// standalone card on left click — the same interaction model as the GM
// bestiary's monster card, but available to every player for their own sheet.
//
// The binding stores a snapshot in the item's metadata (synced with the scene),
// so a GM clicking a player's token sees that player's sheet. If the bound
// owner is the local player, the floating card reads the live local sheet
// instead so HP / Hope edits show up immediately.
import OBR from '@owlbear-rodeo/sdk';
import type { Item } from '@owlbear-rodeo/sdk';
import type { CharData, Role } from './types';
import { normalizeChar } from './charSync';
import { loadChar } from './characterPanel';
import { SUITE_BASE } from './sidebarTools';

export const CHAR_TOKEN_KEY = 'com.daggerheart-obr/char-token';
export const CHAR_CARD_ID = 'com.daggerheart-obr/char-card';
export const CHAR_CARD_CHANNEL = 'com.daggerheart-obr/char-card';
export const CHAR_TARGET_KEY = 'dh_char_card_target_v1';
export const CHAR_POS_KEY = 'dh_char_card_pos_v1';
export const CHAR_CARD_W = 360;
export const CHAR_CARD_H = 540;
const MENU_BIND = 'com.daggerheart-obr/char-bind';

export interface CharBinding {
  ownerId: string;
  ownerName: string;
  charName: string;
  data: CharData;
}
export interface CharCardTarget { itemId: string; name: string }
export interface CardPos { left: number; top: number }
export type CharCardMessage =
  | { type: 'switch'; target: CharCardTarget }
  | { type: 'closed' };

export function charCardUrl(): string { return `${SUITE_BASE}index.html?mode=charcard`; }

// ---------- local view state (shared by same-origin iframes) ----------
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory only */ }
}
export function setCharTarget(t: CharCardTarget) { write(CHAR_TARGET_KEY, t); }
export function getCharTarget(): CharCardTarget | null {
  const t = read<CharCardTarget>(CHAR_TARGET_KEY);
  return t && typeof t.itemId === 'string' ? t : null;
}
export function setCharPos(p: CardPos) { write(CHAR_POS_KEY, p); }
export function getCharPos(): CardPos | null {
  const p = read<CardPos>(CHAR_POS_KEY);
  return p && Number.isFinite(p.left) && Number.isFinite(p.top) ? p : null;
}

// ---------- binding in scene item metadata ----------
export function readCharBinding(item?: Item): CharBinding | null {
  if (!item) return null;
  const raw = item.metadata?.[CHAR_TOKEN_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<CharBinding>;
  const data = normalizeChar(b.data);
  if (!data) return null;
  return {
    ownerId: typeof b.ownerId === 'string' ? b.ownerId : '',
    ownerName: typeof b.ownerName === 'string' ? b.ownerName : '',
    charName: typeof b.charName === 'string' ? b.charName : data.name,
    data,
  };
}

export async function getCharBinding(itemId: string): Promise<CharBinding | null> {
  if (!OBR.isAvailable) return null;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return readCharBinding(items[0]);
  } catch { return null; }
}

export async function bindCharToItem(itemId: string, binding: CharBinding | null): Promise<void> {
  if (!OBR.isAvailable) return;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      if (binding) it.metadata[CHAR_TOKEN_KEY] = { ...binding };
      else delete it.metadata[CHAR_TOKEN_KEY];
    }
  });
}

/** Right-click handler: bind (or refresh) the local player's sheet. */
export async function bindCurrentChar(itemId: string, itemName: string): Promise<void> {
  if (!OBR.isAvailable) return;
  const data = normalizeChar(loadChar());
  if (!data) { await OBR.notification.show('角色卡数据无效', 'ERROR'); return; }
  let ownerId = '';
  let ownerName = '玩家';
  try {
    ownerId = await OBR.player.getId();
    ownerName = (await OBR.player.getName()) || data.name || '玩家';
  } catch { /* keep defaults */ }
  await bindCharToItem(itemId, {
    ownerId, ownerName,
    charName: data.name || ownerName,
    data,
  });
  await OBR.notification.show(`已把「${data.name || ownerName}」的角色卡绑定到 ${itemName || '头像'}`, 'SUCCESS');
}

// ---------- floating card ----------
function notify(message: CharCardMessage) {
  try {
    if (OBR.isAvailable) {
      OBR.broadcast.sendMessage(CHAR_CARD_CHANNEL, message, { destination: 'LOCAL' }).catch(() => {});
    }
  } catch { /* ignore */ }
  try {
    const ch = new BroadcastChannel(CHAR_CARD_CHANNEL);
    ch.postMessage(message);
    setTimeout(() => ch.close(), 250);
  } catch { /* ignore */ }
}

export function startCharCardMessages(cb: (m: CharCardMessage) => void) {
  const deliver = (raw: unknown) => {
    const m = raw as CharCardMessage | undefined;
    if (m && typeof m === 'object' && (m.type === 'switch' || m.type === 'closed')) cb(m);
  };
  if (OBR.isAvailable) {
    const wire = () => {
      try { OBR.broadcast.onMessage(CHAR_CARD_CHANNEL, ev => deliver(ev.data)); } catch { /* ignore */ }
    };
    if (OBR.isReady) wire(); else OBR.onReady(wire);
  }
  try {
    const ch = new BroadcastChannel(CHAR_CARD_CHANNEL);
    ch.onmessage = ev => deliver(ev.data);
  } catch { /* ignore */ }
}

let cardOpen = false;

function openPopover(pos: CardPos): Promise<void> {
  return OBR.popover.open({
    id: CHAR_CARD_ID,
    url: charCardUrl(),
    width: CHAR_CARD_W,
    height: CHAR_CARD_H,
    anchorReference: 'POSITION',
    anchorPosition: pos,
    hidePaper: true,
    disableClickAway: true,
  });
}

async function defaultPos(): Promise<CardPos> {
  try {
    const w = await OBR.viewport.getWidth();
    const h = await OBR.viewport.getHeight();
    return {
      left: Math.max(16, w - CHAR_CARD_W - 26),
      top: Math.max(16, Math.min(110, h - CHAR_CARD_H - 20)),
    };
  } catch { return { left: 900, top: 110 }; }
}

export async function showCharCard(itemId: string, itemName?: string): Promise<void> {
  if (!OBR.isAvailable) return;
  const target: CharCardTarget = { itemId, name: itemName || '' };
  setCharTarget(target);
  const pos = getCharPos() ?? await defaultPos();
  setCharPos(pos);
  if (cardOpen) notify({ type: 'switch', target });
  cardOpen = true;
  await openPopover(pos);
}

export async function moveCharCard(left: number, top: number): Promise<void> {
  const pos = { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)) };
  setCharPos(pos);
  if (!OBR.isAvailable) return;
  await openPopover(pos);
}

export async function dockCharCard(corner: 'tl' | 'tr' | 'bl' | 'br'): Promise<void> {
  let w = 1200, h = 800;
  if (OBR.isAvailable) {
    try { w = await OBR.viewport.getWidth(); h = await OBR.viewport.getHeight(); } catch { /* defaults */ }
  } else { w = window.innerWidth; h = window.innerHeight; }
  const left = corner === 'tr' || corner === 'br' ? Math.max(8, w - CHAR_CARD_W - 18) : 18;
  const top = corner === 'bl' || corner === 'br' ? Math.max(8, h - CHAR_CARD_H - 18) : 18;
  await moveCharCard(left, top);
}

export async function closeCharCard(): Promise<void> {
  if (!OBR.isAvailable) return;
  try { await OBR.popover.close(CHAR_CARD_ID); } catch { /* ignore */ }
  notify({ type: 'closed' });
}

// ---------- right-click menu + left-click auto card ----------
export function setupCharToken(_role: Role): void {
  if (!OBR.isAvailable) return;
  const wire = () => {
    // One menu item with two state-dependent icons.
    const base = { max: 1 };
    void OBR.contextMenu.create({
      id: MENU_BIND,
      icons: [
        {
          icon: `${SUITE_BASE}bestiary/bind.svg`,
          label: '绑定我的角色卡',
          filter: { ...base, every: [{ key: ['metadata', CHAR_TOKEN_KEY], value: undefined }] },
        },
        {
          icon: `${SUITE_BASE}bestiary/swap.svg`,
          label: '更新我的角色卡绑定',
          filter: base,
        },
      ],
      onClick: async (context) => {
        const item = context.items[0];
        if (!item) return;
        await bindCurrentChar(item.id, item.name || '头像');
      },
    });

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
            if (!item || !readCharBinding(item)) return;
            await showCharCard(item.id, item.name || '未命名头像');
          } catch { /* transient */ }
        })();
      });
    } catch { /* ignore */ }

    const onClosed = (raw: unknown) => {
      const m = raw as CharCardMessage | undefined;
      if (m?.type === 'closed') cardOpen = false;
    };
    try { OBR.broadcast.onMessage(CHAR_CARD_CHANNEL, ev => onClosed(ev.data)); } catch { /* ignore */ }
    try {
      const ch = new BroadcastChannel(CHAR_CARD_CHANNEL);
      ch.onmessage = ev => onClosed(ev.data);
    } catch { /* ignore */ }
  };
  if (OBR.isReady) wire(); else OBR.onReady(wire);
}
