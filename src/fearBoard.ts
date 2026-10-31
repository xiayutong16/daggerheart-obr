// GM Fear board (恐惧池) — the GM's only metacurrency in Daggerheart.
//
// SRD: you start a campaign with 1 Fear per PC, gain 1 whenever a PC rolls with
// Fear (also on rests / ability triggers), can never hold more than 12, Fear
// carries over between sessions, and 1 Fear buys an interrupt, an extra GM move,
// an adversary / environment Fear Feature, or an adversary's Experience bonus.
// The pool itself lives on the character sheet (`fear`), so this board and the
// character tab always agree.
import { el, clear } from './dom';
import { FEAR_MAX, getFear, setFear } from './settle';
import { playSfx } from './sound';

const OPEN_KEY = 'dh_fb_open';

interface Scene {
  label: string;
  range: [number, number];
  eg: string;
}

/** SRD 的「一场戏该花多少恐惧」参考表。 */
const SCENES: Scene[] = [
  { label: '日常', range: [0, 1], eg: '情感戏后的闲聊、打听消息、市集补给、休整片段' },
  { label: '次要', range: [1, 3], eg: '旅途中的随机事件、引出新敌人的小遭遇' },
  { label: '标准', range: [2, 4], eg: '有关键目标的大型战斗、凶险旅途、紧张交涉' },
  { label: '主要', range: [4, 8], eg: '与独狼 / 领袖敌人的大战、角色命运转折' },
  { label: '高潮', range: [6, 12], eg: '与最终头目的决战、史诗级战役' },
];

const SPENDS = [
  '打断玩家，夺取聚焦并执行一次 GM 行动',
  '在一次 GM 行动之后再追加一次行动',
  '使用敌人的恐惧特性（按该条目标注的点数）',
  '使用环境的恐惧特性（按标注点数）',
  '把某个敌人的经历加值加进它的一次掷骰',
  '即兴一次「恐惧行动」：突降强敌、敌人变身、环境剧变',
];

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Every mounted board registers its renderer so a settlement can refresh it. */
const boards = new Set<{ node: HTMLElement; render: () => void }>();

/** Short-lived banner: "某玩家 掷出恐惧 · 恐惧池 +1". */
let flash: { text: string } | null = null;
let flashTimer = 0;

/**
 * Re-render any live Fear board. Pass `gain` when the pool just grew so the
 * board can show where the point came from.
 */
export function refreshFearBoards(gain?: { amount: number; from?: string; before?: number }) {
  if (gain) {
    const who = gain.from ? `${gain.from} ` : '';
    flash = { text: `▲ ${who}掷出恐惧 · 恐惧池 +${gain.amount}` };
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flash = null;
      refreshFearBoards();
    }, 5200);
  }
  for (const b of [...boards]) {
    if (!b.node.isConnected) {
      boards.delete(b); // panel was rebuilt — drop the stale renderer
      continue;
    }
    b.render();
  }
}

export function fearBoard(): HTMLElement {
  const box = el('div', { class: 'fear-board' });
  let sceneIdx = 2; // 默认「标准」
  let open = readOpen();

  function change(next: number) {
    setFear(next);
    playSfx('click');
    render();
  }

  function render() {
    clear(box);
    const f = getFear();
    box.className = 'fear-board' + (open ? '' : ' is-collapsed');

    // ---- header: title, count, ± , collapse ----
    const head = el('div', { class: 'fb-head' },
      el('div', { class: 'fb-title' }, '💀 恐惧池'),
      el('div', { class: 'fb-count' + (flash ? ' bump' : '') },
        el('b', {}, String(f)),
        el('span', { class: 'fb-max' }, ` / ${FEAR_MAX}`),
      ),
      el('div', { class: 'fb-ctrl' },
        el('button', { class: 'fb-step', disabled: f <= 0 ? 'disabled' : undefined, onclick: () => change(f - 1) }, '−'),
        el('button', { class: 'fb-step', disabled: f >= FEAR_MAX ? 'disabled' : undefined, onclick: () => change(f + 1) }, '+'),
      ),
      el('button', {
        class: 'fb-toggle',
        onclick: () => {
          open = !open;
          writeOpen(open);
          playSfx('click');
          render();
        },
      }, open ? '收起' : '展开'),
    );
    box.append(head);
    // The pool grew because a player's roll came in — say so, even when collapsed.
    if (flash) box.append(el('div', { class: 'fb-flash' }, flash.text));
    if (!open) return;

    // ---- 12 pips, click one to set the pool ----
    const pips = el('div', { class: 'fb-pips' });
    for (let i = 0; i < FEAR_MAX; i++) {
      pips.append(el('button', {
        class: 'fb-pip' + (i < f ? ' on' : '') + (i === 5 ? ' gap' : ''),
        title: `设为 ${i + 1} 点`,
        onclick: () => change(i + 1),
      }));
    }
    box.append(pips);

    // ---- quick steps ----
    box.append(el('div', { class: 'fb-quick' },
      el('button', { class: 'fb-q', onclick: () => change(f + 1) }, '+1'),
      el('button', { class: 'fb-q', onclick: () => change(f + 2) }, '+2'),
      el('button', { class: 'fb-q', onclick: () => change(f + 3) }, '+3'),
      el('button', { class: 'fb-q', onclick: () => change(f - 1) }, '−1'),
      el('button', { class: 'fb-q wide', onclick: () => change(0) }, '清零'),
    ));

    // ---- scene tension budget ----
    const chips = el('div', { class: 'fb-scenes' });
    SCENES.forEach((s, i) => {
      chips.append(el('button', {
        class: 'fb-chip' + (i === sceneIdx ? ' on' : ''),
        onclick: () => {
          sceneIdx = i;
          playSfx('click');
          render();
        },
      }, `${s.label} ${s.range[0]}–${s.range[1]}`));
    });
    const [lo, hi] = SCENES[sceneIdx].range;
    const verdict = f < lo ? '偏少 · 还能再攒一点' : f > hi ? '偏多 · 该花出去了' : '正好在区间内';
    const tone = f < lo ? 'low' : f > hi ? 'high' : 'ok';

    box.append(el('div', { class: 'fb-scene-label' }, '本场张力预算'));
    box.append(chips);
    box.append(el('div', { class: `fb-guide ${tone}` },
      `建议花 ${lo}–${hi} 点　·　你现在 ${f} 点（${verdict}）`,
    ));
    box.append(el('div', { class: 'fb-eg' }, SCENES[sceneIdx].eg));

    // ---- rules cheat sheet ----
    box.append(el('details', { class: 'fb-ref' },
      el('summary', {}, '规则速查 · 怎么获得 / 怎么花'),
      el('div', { class: 'fb-ref-body' },
        el('p', {},
          '开局恐惧 = 队伍人数。任何玩家掷出「恐惧骰 > 希望骰」的结果会自动 +1（不用手动点）；' +
          '休整、能力与敌人特性也可给予。' +
          `上限 ${FEAR_MAX} 点，跨场次保留。`),
        el('p', { class: 'fb-ref-sub' }, '花 1 点可以做：'),
        el('ul', {}, ...SPENDS.map((t) => el('li', {}, t))),
        el('p', { class: 'fb-note' }, '恐惧是用来加戏的，不是用来掐死玩家的英雄时刻的。'),
      ),
    ));
  }

  render();
  boards.add({ node: box, render });
  return box;
}
