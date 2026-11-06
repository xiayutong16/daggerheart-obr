// Floating standalone character card — rendered inside index.html?mode=charcard.
// GM and players alike can bind their sheet to a token (right click) and open
// this card by left-clicking that token.
import OBR from '@owlbear-rodeo/sdk';
import { el, clear } from './dom';
import type { CharData } from './types';
import { TRAITS, CLASSES } from './data/classes';
import { loadChar } from './characterPanel';
import { normalizeChar } from './charSync';
import {
  getCharTarget, getCharBinding, bindCharToItem, getCharPos,
  moveCharCard, dockCharCard, closeCharCard, startCharCardMessages,
  type CharBinding, type CharCardTarget,
} from './charToken';

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';

function signed(n: number): string { return n > 0 ? `+${n}` : String(n); }
function bar(label: string, cur: number, max: number, cls: string) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (cur / max) * 100)) : 0;
  return el('div', { class: 'cc-bar' },
    el('div', { class: 'cc-bar-head' }, el('span', {}, label), el('b', {}, `${cur} / ${max}`)),
    el('div', { class: 'cc-bar-track' }, el('div', { class: `cc-bar-fill ${cls}`, style: `width:${pct}%` })),
  );
}
function pips(n: number, max: number) {
  const box = el('div', { class: 'cc-pips' });
  for (let i = 0; i < max; i++) box.append(el('span', { class: 'cc-pip' + (i < n ? ' on' : '') }));
  return box;
}

function cardBody(itemName: string, binding: CharBinding, d: CharData): HTMLElement {
  const cls = CLASSES.find(c => c.zh === d.classZh);
  const dockBtn = (arrow: string, label: string, corner: 'tl' | 'tr' | 'bl' | 'br') =>
    el('button', { class: 'cc-dock', title: `停靠${label}`, onclick: () => void dockCharCard(corner) }, arrow);
  const top = el('div', { class: 'cc-top' },
    el('span', { class: 'cc-grip', title: '按住这里拖动浮窗' }, '⠿'),
    el('span', { class: 'cc-avatar' }, `🎭 ${itemName}`),
    el('div', { class: 'cc-spacer' }),
    el('div', { class: 'cc-docks' },
      dockBtn('↖', '左上', 'tl'), dockBtn('↗', '右上', 'tr'),
      dockBtn('↙', '左下', 'bl'), dockBtn('↘', '右下', 'br')),
    el('button', { class: 'cc-x', title: '关闭', onclick: () => void closeCharCard() }, '×'),
  );

  const head = el('div', { class: 'cc-head' },
    el('div', { class: 'cc-name' }, d.name || '未命名冒险者'),
    el('div', { class: 'cc-class' }, `${d.classZh} ${cls?.en || ''} · ${d.subclass || '未选择子职'}`),
    el('div', { class: 'cc-lineage' }, `${d.ancestry || '—'}　·　${d.community || '—'}`),
  );

  const traits = el('div', { class: 'cc-traits' }, ...TRAITS.map(t =>
    el('div', { class: 'cc-trait' },
      el('div', { class: 'cc-trait-en' }, t.en.toUpperCase()),
      el('div', { class: 'cc-trait-val' }, signed(d.traits[t.zh] ?? 0)),
      el('div', { class: 'cc-trait-zh' }, t.zh),
    )));

  const stats = el('div', { class: 'cc-stats' },
    el('div', { class: 'cc-stat' }, el('span', {}, '闪避'), el('b', {}, String(d.evasion))),
    el('div', { class: 'cc-stat' }, el('span', {}, '熟练'), el('b', {}, String(d.proficiency))),
    el('div', { class: 'cc-stat' }, el('span', {}, '阈值'), el('b', {}, d.thresholds || '—')),
  );

  const cols = el('div', { class: 'cc-cols' },
    el('div', { class: 'cc-col' },
      el('div', { class: 'cc-col-title' }, '经历'),
      d.experiences.length
        ? el('div', { class: 'cc-tags' }, ...d.experiences.map(x => el('span', { class: 'cc-tag exp' }, x)))
        : el('div', { class: 'cc-empty' }, '暂无'),
    ),
    el('div', { class: 'cc-col' },
      el('div', { class: 'cc-col-title' }, '领域卡'),
      d.domainCards.length
        ? el('div', { class: 'cc-tags' }, ...d.domainCards.map(x => el('span', { class: 'cc-tag card' }, x)))
        : el('div', { class: 'cc-empty' }, '暂无'),
    ),
  );

  const foot = el('div', { class: 'cc-foot' },
    el('span', {}, `由 ${binding.ownerName || '玩家'} 绑定`),
    el('button', {
      class: 'cc-unbind',
      onclick: () => void (async () => {
        await bindCharToItem(getCharTarget()?.itemId || '', null);
        try { await OBR.notification.show('已解除角色卡绑定', 'INFO'); } catch { /* ignore */ }
        await closeCharCard();
      })(),
    }, '✕ 解除绑定'),
  );

  const card = el('div', { class: 'cc-card' },
    top, head, traits,
    el('div', { class: 'cc-bars' },
      bar('生命 HP', d.hp, d.hpMax, 'hp'),
      bar('压力 Stress', d.stress, d.stressMax, 'stress'),
      bar('护甲 Armor', d.armor, d.armorMax, 'armor'),
    ),
    stats,
    el('div', { class: 'cc-hope' }, el('span', {}, '希望 HOPE'), pips(d.hope, 6)),
    cols, foot,
  );
  wireDrag(top);
  return card;
}

let dragging: { startX: number; startY: number; pos: { left: number; top: number } } | null = null;
let lastMove = 0;
let pending: { left: number; top: number } | null = null;
function wireDrag(handle: HTMLElement) {
  handle.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    dragging = { startX: ev.clientX, startY: ev.clientY, pos: getCharPos() ?? { left: 0, top: 0 } };
    try { handle.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    pending = {
      left: dragging.pos.left + (ev.clientX - dragging.startX),
      top: dragging.pos.top + (ev.clientY - dragging.startY),
    };
    const now = Date.now();
    if (now - lastMove > 90) { lastMove = now; void moveCharCard(pending.left, pending.top); }
  });
  const finish = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = null;
    handle.classList.remove('dragging');
    try { handle.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (pending) void moveCharCard(pending.left, pending.top);
    pending = null;
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

export async function startCharCardPage(): Promise<void> {
  const root = document.getElementById('app')!;
  root.className = 'charcard-root';
  document.body.classList.add('charcard-mode');
  // Scene item reads need a ready message bus.
  if (OBR.isAvailable) {
    await new Promise<void>(res => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      try { OBR.onReady(finish); } catch { finish(); }
      setTimeout(finish, 2000);
    });
  }
  let target: CharCardTarget | null = getCharTarget();
  if (!target && params.get('item')) {
    target = { itemId: params.get('item')!, name: params.get('name') || '头像' };
  }

  startCharCardMessages((m) => {
    if (m.type === 'switch') { target = m.target; void render(); }
  });

  async function render() {
    clear(root);
    if (!target) {
      root.append(el('div', { class: 'cc-blank' },
        el('div', { class: 'cc-blank-icon' }, '📋'),
        el('div', { class: 'cc-blank-title' }, '还没有选中角色卡'),
        el('div', { class: 'cc-blank-text' }, '在枭雄里右键头像 →「绑定我的角色卡」，之后左键点它就会自动浮出这张卡。'),
        el('button', { class: 'cc-blank-btn', onclick: () => void closeCharCard() }, '关闭'),
      ));
      return;
    }

    let binding: CharBinding | null = await getCharBinding(target.itemId);
    if (!binding && DEMO && !OBR.isAvailable) {
      const live = normalizeChar(loadChar());
      if (live) binding = { ownerId: 'local', ownerName: '本机预览', charName: live.name, data: live };
    }
    if (!binding) {
      root.append(el('div', { class: 'cc-blank' },
        el('div', { class: 'cc-blank-icon' }, '🔗'),
        el('div', { class: 'cc-blank-title' }, '这个头像还没绑定角色卡'),
        el('div', { class: 'cc-blank-text' }, '右键它 →「绑定我的角色卡」，之后左键点它即可查看。'),
        el('button', { class: 'cc-blank-btn', onclick: () => void closeCharCard() }, '关闭'),
      ));
      return;
    }

    let d = binding.data;
    try {
      const me = await OBR.player.getId();
      if (binding.ownerId === me) {
        const live = normalizeChar(loadChar());
        if (live) d = live;
      }
    } catch { /* Owlbear unavailable: keep the snapshot */ }
    root.append(cardBody(target.name, binding, d));
  }

  await render();
}
