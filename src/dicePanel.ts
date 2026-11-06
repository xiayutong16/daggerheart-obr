import { el, clear, appendAll } from './dom';
import {
  rollDuality,
  rollPolyhedral,
  QUADRANTS,
  CRITICAL_INFO,
  quadrantFor,
  quadrantInfo,
  pickSub,
} from './dice';
import { TRAITS } from './data/classes';
import { loadChar } from './characterPanel';
import { appState } from './state';
import { playSfx } from './sound';
import { animateDice } from './diceAnim';
import { castDiceToTable } from './tableDice';
import {
  autoSettleOn,
  setAutoSettle,
  tableDiceOn,
  setTableDice,
  gainHope,
  gainFear,
  getFear,
  HOPE_MAX,
  FEAR_MAX,
} from './settle';
import {
  rollLog,
  onRollLogChange,
  pushRoll,
  resetRollLogListeners,
  setLocalRole,
  newId,
} from './rollLog';
import { getForced, setForced, takeForced, isPersisted, FORCE_MIN, FORCE_MAX } from './force';
import {
  DIE_TYPES, parseExpression, bumpGroup, bumpModifier, cycleAdv,
  maxSides, rollExpression, diceDetail,
} from './expression';
import { fearBoard, refreshFearBoards } from './fearBoard';
import { getLocalDifficulty, setLocalDifficulty, onLocalDifficulty } from './localDifficulty';
import {
  getQuickRolls, onQuickRollsChange, removeQuickRoll, clearQuickRolls,
  criticalExtra, damageFormula, newQuickId,
  type QuickRoll, type DamageDice,
} from './quickRolls';
import type { DualityResult, Quadrant, Role } from './types';

/** Subscriptions live outside `refresh()` so tab switches never stack them up. */
let offDiff: (() => void) | null = null;
let offQuick: (() => void) | null = null;

export function renderDicePanel(root: HTMLElement, role: Role) {
  clear(root);
  resetRollLogListeners();
  setLocalRole(role);
  offQuick?.();

  // ---- sub tab state ----
  // `?sub=duality` only matters for local previews/debugging inside a plain browser.
  let sub: 'poly' | 'duality' =
    new URLSearchParams(location.search).get('sub') === 'duality' ? 'duality' : 'poly';

  const subBar = el('div', { class: 'subtabs' });
  const polyBtn = el('button', { class: 'subtab active', onclick: () => { sub = 'poly'; refresh(); } }, '多面骰 · 标准');
  const dualityBtn = el('button', { class: 'subtab', onclick: () => { sub = 'duality'; refresh(); } }, '二元骰 · 希望/恐惧');
  subBar.append(polyBtn, dualityBtn);

  const body = el('div', { class: 'panel-body' });
  const logSlot = el('div');
  const quickSlot = el('div');

  function paintQuick() {
    clear(quickSlot);
    quickSlot.append(quickRollsView(role));
  }
  offQuick = onQuickRollsChange(paintQuick);

  function refresh() {
    polyBtn.className = 'subtab' + (sub === 'poly' ? ' active' : '');
    dualityBtn.className = 'subtab' + (sub === 'duality' ? ' active' : '');
    resetRollLogListeners();
    clear(body);
    body.append(sub === 'poly' ? polyView(role) : dualityView(role));

    clear(logSlot);
    logSlot.append(rollLogView(role));
    paintQuick();
  }

  root.append(quickSlot, subBar, body, logSlot);
  // The GM's Fear board sits above the tabs so it stays visible on both dice views.
  if (role === 'GM') root.prepend(fearBoard());
  refresh();
}

function dieBox(label: string, value: number | string, kind: 'hope' | 'fear' | 'plain' | 'adv') {
  return el('div', { class: `die die-${kind}` },
    el('div', { class: 'die-label' }, label),
    el('div', { class: 'die-value' }, String(value)),
  );
}

/** The canvas stage shown while the dice tumble. */
function diceStage() {
  const canvas = el('canvas', { class: 'dice-stage' }) as HTMLCanvasElement;
  const wrap = el('div', { class: 'dice-stage-wrap' }, canvas);
  return { wrap, canvas };
}

/**
 * Keep the settled dice on screen for a moment before folding the stage away, so
 * the table actually gets to read the numbers instead of watching them vanish.
 */
function holdStage(wrap: HTMLElement, ms: number) {
  window.setTimeout(() => {
    if (!wrap.isConnected) return;
    wrap.classList.add('stage-out');
    window.setTimeout(() => wrap.remove(), 480);
  }, ms);
}

interface ForcePanel {
  node: HTMLElement;
  /** Re-render the status line; `clearInput` also wipes the box after a roll used it. */
  refresh: (clearInput?: boolean) => void;
  /** The roll happened, but its dice were too small to use the pending value. */
  notifySkipped: (sides: number) => void;
}

/**
 * GM-only "指定点数" control. The value is kept on this machine only and is never
 * broadcast, so the players' panels have no idea it exists.
 */
function forcePanel(): ForcePanel {
  const input = el('input', {
    class: 'input force-input',
    type: 'number',
    min: String(FORCE_MIN),
    max: String(FORCE_MAX),
    placeholder: '例如 20',
  }) as HTMLInputElement;
  const note = el('div', { class: 'force-note' });
  const setBtn = el('button', { class: 'btn-mini' }, '设定');
  const clrBtn = el('button', { class: 'btn-mini ghost' }, '清除');
  const box = el('div', { class: 'force-box' });

  const current = getForced();
  if (current != null) input.value = String(current);

  let skipTimer = 0;

  function pendingText(v: number): string {
    const tail = isPersisted() ? '（用掉即失效 · 面数不够则保留）' : '（仅本页会话有效 · 本地存档被浏览器拦截）';
    return `⏳ 待生效：下一次 d${v} 及以上的骰子必出 ${v}${tail}`;
  }

  function flash() {
    box.classList.remove('flash');
    void box.offsetWidth; // restart the animation
    box.classList.add('flash');
  }

  function refresh(clearInput = false) {
    clearTimeout(skipTimer);
    const v = getForced();
    if (v == null) {
      if (clearInput) input.value = '';
      note.textContent = clearInput ? '✔ 已用于刚才那一次投掷 · 现在回到随机' : '未设定 · 骰子正常随机';
      note.className = 'force-note' + (clearInput ? ' ok' : '');
      clrBtn.disabled = true;
    } else {
      note.textContent = pendingText(v);
      note.className = 'force-note on';
      clrBtn.disabled = false;
    }
  }

  function apply() {
    const raw = input.value.trim();
    if (!raw) {
      note.textContent = `先填一个点数（${FORCE_MIN}–${FORCE_MAX}）再点设定`;
      note.className = 'force-note err';
      input.focus();
      return;
    }
    const v = Math.round(Number(raw));
    if (!Number.isFinite(v) || v < FORCE_MIN || v > FORCE_MAX) {
      note.textContent = `只能填 ${FORCE_MIN}–${FORCE_MAX} 之间的整数，例如 20`;
      note.className = 'force-note err';
      return;
    }
    input.value = String(v);
    setForced(v);
    playSfx('click');
    refresh();
    flash();
  }

  setBtn.addEventListener('click', apply);
  clrBtn.addEventListener('click', () => {
    setForced(null);
    input.value = '';
    playSfx('click');
    refresh();
  });
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') apply();
  });
  input.addEventListener('input', () => {
    const empty = input.value.trim() === '';
    setBtn.classList.toggle('ready', !empty);
  });

  refresh();
  appendAll(box,
    el('div', { class: 'force-head' }, '🎯 指定点数 · 仅 GM 本机可见'),
    el('div', { class: 'force-row' }, input, setBtn, clrBtn),
    note,
    el('div', { class: 'force-hint' },
      '填好点数后点「设定」（或按回车）。只作用于你这台机器上的下一次投掷，玩家端完全看不到；' +
      '面数不足时（例如设 20 却投 d12）不消耗设定。'),
  );
  setBtn.classList.toggle('ready', input.value.trim() !== '');

  return {
    node: box,
    refresh,
    notifySkipped(sides: number) {
      const v = getForced();
      if (v == null) return;
      note.textContent = `⚠ 本次骰面只有 d${sides}，出不了 ${v} —— 设定保留，等下一次 d${v} 及以上`;
      note.className = 'force-note warn';
      clearTimeout(skipTimer);
      skipTimer = window.setTimeout(() => refresh(), 4200);
    },
  };
}

// ---------------------------------------------------------------- duality

function dualityView(role: Role) {
  const isGM = role === 'GM';
  const wrap = el('div');

  // Character sheet linkage — a player's trait values come straight from their own sheet.
  const sheet = loadChar();

  const traitSel = el('select', { class: 'input' });
  traitSel.append(el('option', { value: '' }, '— 不联动（手动填调整值）—'));
  for (const t of TRAITS) {
    const v = sheet.traits[t.zh] ?? 0;
    traitSel.append(el('option', { value: t.zh }, `${t.zh} ${t.en}　${v >= 0 ? '+' : ''}${v}`));
  }

  const modInput = el('input', { class: 'input', type: 'number', value: '0', step: '1' });
  const linkNote = el('div', { class: 'link-note' }, '');

  // ---- experiences: a relevant experience adds +2 to the roll ----
  const expList = sheet.experiences ?? [];
  const expSel = el('select', { class: 'input', ...(expList.length ? {} : { disabled: 'disabled' }) });
  expSel.append(el('option', { value: '' }, expList.length ? '— 本次不使用经历 —' : '（角色卡里还没有经历，可先去角色卡添加）'));
  expList.forEach((x, i) => expSel.append(el('option', { value: String(i) }, `${x}　+2`)));
  const expNote = el('div', { class: 'link-note exp-note' }, '');

  const modSummary = el('div', { class: 'mod-summary' }, '');
  const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

  const baseMod = () => parseInt(modInput.value || '0', 10) || 0;
  const expIndex = () => (expSel.value === '' ? -1 : parseInt(expSel.value, 10));
  const expBonus = () => (expIndex() >= 0 ? 2 : 0);
  const expName = () => (expIndex() >= 0 ? expList[expIndex()] : '');

  function refreshSummary() {
    const base = baseMod();
    const bonus = expBonus();
    if (!bonus) {
      modSummary.textContent = `本次调整值 ${sign(base)}`;
      modSummary.className = 'mod-summary';
      return;
    }
    modSummary.textContent = `本次调整值 ${sign(base)}（属性）＋ 2（经历）＝ ${sign(base + bonus)}`;
    modSummary.className = 'mod-summary has-exp';
  }
  refreshSummary();

  traitSel.addEventListener('change', () => {
    const zh = traitSel.value;
    if (!zh) {
      linkNote.textContent = '';
      refreshSummary();
      return;
    }
    const v = sheet.traits[zh] ?? 0;
    modInput.value = String(v);
    linkNote.textContent = `已联动角色卡 · ${zh} ${sign(v)}`;
    refreshSummary();
  });
  modInput.addEventListener('input', refreshSummary);
  expSel.addEventListener('change', () => {
    const name = expName();
    expNote.textContent = name ? `经历加值 +2 · ${name}` : '';
    refreshSummary();
  });

  const rollWith = el('select', { class: 'input' });
  rollWith.append(
    el('option', { value: 'none' }, '无'),
    el('option', { value: 'advantage' }, '优势 (+d6)'),
    el('option', { value: 'disadvantage' }, '劣势 (-d6)'),
  );

  // Per-client difficulty: nothing is published to the room and nobody receives
  // a GM-owned value. Both GM and players type their own number when they need
  // a success / fail verdict; empty means "only resolve Hope vs Fear".
  const diffInput = el('input', { class: 'input', type: 'number', placeholder: '如 10、15（留空则只判希望/恐惧）' });
  const diffState = el('div', { class: 'link-note diff-note' }, '');
  const blindChk = el('input', { type: 'checkbox' });

  const initialDiff = getLocalDifficulty();
  if (initialDiff != null) diffInput.value = String(initialDiff);

  function paintDiff(v: number | null) {
    if (v == null) {
      diffState.textContent = '未填难度 · 本次只判希望 / 恐惧走向';
      diffState.className = 'link-note diff-note';
    } else {
      diffState.textContent = `本地难度 ${v} · 只用于你这台机器的判定`;
      diffState.className = 'link-note diff-note on';
    }
  }
  paintDiff(initialDiff);

  diffInput.addEventListener('input', () => {
    const raw = diffInput.value.trim();
    const n = raw === '' ? null : parseInt(raw, 10);
    setLocalDifficulty(Number.isFinite(n as number) ? (n as number) : null);
  });

  offDiff?.();
  offDiff = onLocalDifficulty((v) => {
    if (v != null && diffInput.value.trim() === '') diffInput.value = String(v);
    paintDiff(v);
  });

  // ---- round-table options ----
  const autoChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  autoChk.checked = autoSettleOn();
  autoChk.addEventListener('change', () => setAutoSettle(autoChk.checked));

  const tableChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  tableChk.checked = tableDiceOn();
  tableChk.disabled = !appState.embedded;
  tableChk.addEventListener('change', () => setTableDice(tableChk.checked));

  const resultBox = el('div', { class: 'result-box is-hidden' });

  // GM-only rigged roll. Players never get this node at all.
  const force = isGM ? forcePanel() : null;

  let rollToken = 0;

  async function doRoll() {
    const token = ++rollToken;
    const base = baseMod();
    const bonus = expBonus();
    const modifier = base + bonus;
    const blind = isGM && blindChk.checked;
    // Local difficulty only — never shared with the rest of the table.
    const difficulty = getLocalDifficulty() ?? undefined;

    // 指定点数：二元骰都是 d12，够用才消耗
    const maxSides = 12;
    const pendingRig = isGM ? getForced() : null;
    const rig = isGM ? takeForced(maxSides) : null;
    if (rig != null) force?.refresh(true);
    else if (pendingRig != null) force?.notifySkipped(maxSides);

    const res = rollDuality({
      modifier,
      rollingWith: rollWith.value as 'none' | 'advantage' | 'disadvantage',
      difficulty,
      force: rig,
    });

    // ---- tumble first, then reveal ----
    clear(resultBox);
    resultBox.classList.remove('is-hidden');
    const stage = diceStage();
    resultBox.append(stage.wrap);
    playSfx('tumble');

    await animateDice(
      stage.canvas,
      [
        { value: res.hope, sides: res.hopeSides, color: '#8b7cff' },
        { value: res.fear, sides: res.fearSides, color: '#ff5c8a' },
      ],
      { onBounce: () => playSfx('bounce') },
    );
    if (token !== rollToken) {
      stage.wrap.remove();
      return;
    }

    // 结果音效：双数（大成功）> 希望 / 恐惧
    if (res.outcome === 'critical') playSfx('doubles');
    else playSfx(res.outcome === 'hope' ? 'hope' : 'fear');

    // ---- automatic Hope / Fear settlement ----
    let settleNote = '';
    let settleTone: 'hope' | 'fear' | null = null;
    if (!blind) {
      if (res.outcome === 'fear') {
        // 恐惧 > 希望：这一分永远归 GM 的恐惧池。
        //   · GM 本机：直接加进自己的池子
        //   · 玩家本机：广播出去，由 GM 的客户端 +1（这里只做提示）
        if (isGM) {
          if (autoChk.checked) {
            const before = getFear();
            const r = gainFear(1);
            settleTone = 'fear';
            settleNote = r.gained === 0
              ? `恐惧池已满 ${FEAR_MAX}，本次未增加`
              : `GM 恐惧 +1（恐惧池 ${r.after}/${FEAR_MAX}）`;
            if (r.gained > 0) refreshFearBoards({ amount: r.gained, from: '你', before });
          }
        } else {
          // 无论本地是否勾选「自动结算」，这条都会进 GM 的恐惧池，
          // 所以提示也照常显示，免得玩家以为漏算了。
          settleTone = 'fear';
          settleNote = `恐惧 ${res.fear} > 希望 ${res.hope} · 恐惧池 +1`;
        }
      } else if (autoChk.checked && !isGM) {
        const r = gainHope(1);
        settleTone = 'hope';
        settleNote = r.capped && r.gained === 0
          ? `希望已达上限 ${HOPE_MAX}，本次未增加`
          : `希望 +${r.gained}（当前 ${r.after}/${HOPE_MAX}）`;
      }
    }

    const card = dualityResultCard(resultBox, res, blind, bonus ? expName() : '', settleNote, settleTone);
    // 骰子留在桌面上再停 2.6 秒，让人看清点数，然后才收起
    holdStage(stage.wrap, 2600);

    // ---- dice on the table (never for blind rolls) ----
    if (tableChk.checked && appState.embedded && !blind) {
      void castDiceToTable({
        dice: [
          { text: String(res.hope), color: '#b3a7ff' },
          { text: String(res.fear), color: '#ff8fb0' },
        ],
        note: `${appState.playerName || (isGM ? 'GM' : '玩家')} · ${outcomeTitle(res)} · 总计 ${res.total}`,
      });
    }

    pushRoll({
      id: newId(),
      ts: Date.now(),
      author: appState.playerName || (isGM ? 'GM' : '玩家'),
      color: appState.playerColor || '#8b7cff',
      gmOnly: blind,
      kind: 'duality',
      tone: res.outcome,
      settleNote,
      summary: `${outcomeTitle(res)} · 总计 ${res.total}`,
      detail:
        `希望 ${res.hope} + 恐惧 ${res.fear}` +
        (base ? ` + 属性 ${sign(base)}` : '') +
        (bonus ? ` + 经历「${expName()}」+2` : '') +
        (difficulty != null ? ` → 本地难度 ${difficulty}（${res.success ? '成功' : '失败'}）` : '') +
        (settleNote ? ` ｜ ${settleNote}` : ''),
    });
  }

  appendAll(wrap,
    el('p', { class: 'hint' },
      isGM
        ? '投掷希望 d12 与恐惧 d12，加上属性调整值与相关经历。较高的那颗决定叙事走向；双骰相同即为大成功。'
        : '选择属性会自动带入你角色卡上的加值；若某段经历适用于这次判定，选中它可再 +2。本地难度自己填，只影响你自己的判定。'),
    field('属性 (Trait) · 联动角色卡', traitSel),
    linkNote,
    field('调整值 (Modifier)', modInput),
    field('经历 (Experience) · 适用则 +2', expSel),
    expNote,
    field('优势 / 劣势', rollWith),
    field('本地难度 (Difficulty) · 仅本机，不同步', diffInput),
    diffState,
    isGM
      ? el('label', { class: 'check blind-check' }, blindChk, el('span', {}, '🔒 暗骰 · 仅 GM 可见(玩家端不显示)'))
      : el('div', { class: 'hint lock-hint' }, '🔒 暗骰仅 GM 可见。本地难度不会同步给其他人。'),
    el('div', { class: 'opt-row' },
      el('label', { class: 'check' }, autoChk, el('span', {}, '自动结算希望 / 恐惧')),
      el('label', { class: 'check' + (appState.embedded ? '' : ' disabled') }, tableChk,
        el('span', {}, appState.embedded ? '投到桌面' : '投到桌面（需在枭雄内）')),
    ),
    modSummary,
    force ? force.node : null,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', onclick: doRoll }, '🎲 投掷二元骰'),
      el('button', { class: 'btn', onclick: doRoll }, '↻ 再掷'),
    ),
    resultBox,
  );
  return wrap;
}

function outcomeTitle(res: DualityResult): string {
  if (res.outcome === 'critical') return CRITICAL_INFO.title;
  const side = res.outcome === 'hope' ? '希望' : '恐惧';
  const q = quadrantFor(res);
  if (q) return quadrantInfo(q)?.title ?? side;
  return `${side}（未填难度）`;
}

function dualityResultCard(
  box: HTMLElement,
  res: DualityResult,
  isBlind = false,
  expName = '',
  settleNote = '',
  settleTone: 'hope' | 'fear' | null = null,
): HTMLElement {
  const card = el('div', { class: 'result-card' });

  const blindBadge = isBlind ? el('div', { class: 'outcome-kicker blind-kicker' }, '🔒 暗骰 · 玩家端不会收到这条结果') : null;

  // ---- only the outcome that actually happened is revealed; the rest stay hidden ----
  if (res.outcome === 'critical') {
    card.append(el('div', { class: 'outcome outcome-critical reveal' },
      el('div', { class: 'outcome-kicker' }, '掷骰结果'),
      blindBadge,
      el('div', { class: 'outcome-title' }, CRITICAL_INFO.title),
      el('div', { class: 'outcome-desc' }, pickSub(CRITICAL_INFO.subs)),
    ));
  } else {
    const active = quadrantFor(res);
    // Without a difficulty we only know the Hope/Fear side, so show that row's title.
    const info = (active && quadrantInfo(active)) || quadrantInfo(
      (res.outcome === 'hope' ? 'hope-success' : 'fear-success') as Quadrant,
    )!;
    card.append(el('div', { class: `outcome outcome-${info.tone} reveal` },
      el('div', { class: 'outcome-kicker' }, active ? '掷骰结果' : '走向判定'),
      blindBadge,
      el('div', { class: 'outcome-title' }, active ? info.title : (info.tone === 'hope' ? '希望 · 主导' : '恐惧 · 主导')),
      el('div', { class: 'outcome-desc' }, pickSub(info.subs)),
    ));
    if (active === null) {
      card.append(el('div', { class: 'no-diff' }, '未填本地难度：本次只判希望 / 恐惧走向，具体成败由 GM 裁定。'));
    }
  }

  // ---- dice ----
  const diceRow = el('div', { class: 'dice-row' });
  diceRow.append(dieBox(`希望 d${res.hopeSides}`, res.hope, 'hope'));
  diceRow.append(dieBox(`恐惧 d${res.fearSides}`, res.fear, 'fear'));
  if (res.rollingWith === 'advantage' && res.advantageDie != null) {
    diceRow.append(dieBox('优势 d6', `+${res.advantageDie}`, 'adv'));
  }
  if (res.rollingWith === 'disadvantage' && res.disadvantageDie != null) {
    diceRow.append(dieBox('劣势 d6', `-${res.disadvantageDie}`, 'adv'));
  }
  card.append(diceRow);

  // ---- math ----
  const calc = el('div', { class: 'calc' });
  let calcText = `希望 ${res.hope} + 恐惧 ${res.fear}`;
  if (res.modifier) calcText += ` + 调整 ${res.modifier}`;
  if (res.rollingWith === 'advantage' && res.advantageDie != null) calcText += ` + 优势 ${res.advantageDie}`;
  if (res.rollingWith === 'disadvantage' && res.disadvantageDie != null) calcText += ` − 劣势 ${res.disadvantageDie}`;
  calc.append(el('div', { class: 'calc-line' }, calcText));
  if (expName) {
    calc.append(el('div', { class: 'calc-line exp-line' }, `其中经历「${expName}」已 +2`));
  }
  calc.append(el('div', { class: 'calc-total' }, `总计 = ${res.total}`));
  if (res.difficulty != null) {
    calc.append(el('div', { class: 'calc-line' },
      `本地难度 ${res.difficulty} → `,
      el('b', { class: res.success ? 'ok' : 'bad' }, res.success ? '成功' : '失败'),
    ));
  }
  card.append(calc);

  if (settleNote) {
    card.append(el('div', { class: `settle-note settle-${settleTone ?? 'hope'}` },
      settleTone === 'fear' ? '💀 ' : '✨ ',
      settleNote,
    ));
  }

  // ---- collapsed reference so nobody sees the flavour text before rolling ----
  card.append(quadrantReference(quadrantFor(res)));

  box.append(card);
  return card;
}

/** A closed <details> listing all four outcomes; the one that happened is marked. */
function quadrantReference(active: Quadrant | null) {
  const rows = el('div', { class: 'quad-grid' });
  for (const q of QUADRANTS) {
    rows.append(el('div', { class: `quad quad-${q.tone}` + (active === q.id ? ' active' : '') },
      el('div', { class: 'quad-title' }, q.title),
      el('div', { class: 'quad-sub' }, q.subs[0]),
    ));
  }
  rows.append(el('div', { class: 'quad quad-critical' },
    el('div', { class: 'quad-title' }, CRITICAL_INFO.title),
    el('div', { class: 'quad-sub' }, CRITICAL_INFO.subs[0]),
  ));
  return el('details', { class: 'quad-ref' },
    el('summary', {}, '结果对照表 · 点击展开'),
    rows,
  );
}

// ---------------------------------------------------------------- polyhedral picker

const POLY_LAST_KEY = 'dh_poly_last_v1';
const POLY_SAVED_KEY = 'dh_poly_saved_v1';
const POLY_BLIND_KEY = 'dh_poly_global_blind_v1';
const POLY_TARGET_KEY = 'dh_poly_target_v1';

interface PolyLast { expr: string; note: string }
function loadPolyLast(): PolyLast {
  try {
    const p = JSON.parse(localStorage.getItem(POLY_LAST_KEY) || '{}');
    if (p && typeof p.expr === 'string') return { expr: p.expr, note: typeof p.note === 'string' ? p.note : '' };
  } catch { /* ignore */ }
  return { expr: '1d20', note: '' };
}
function savePolyLast(expr: string, note: string) {
  try { localStorage.setItem(POLY_LAST_KEY, JSON.stringify({ expr, note })); } catch { /* ignore */ }
}
function loadPolySaved(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(POLY_SAVED_KEY) || '[]');
    if (Array.isArray(a)) return a.filter(x => typeof x === 'string').slice(0, 8);
  } catch { /* ignore */ }
  return [];
}
function savePolySaved(list: string[]) {
  try { localStorage.setItem(POLY_SAVED_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
function globalBlindOn(): boolean {
  try { return localStorage.getItem(POLY_BLIND_KEY) === '1'; } catch { return false; }
}
function setGlobalBlind(on: boolean) {
  try { localStorage.setItem(POLY_BLIND_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}
function loadTarget(): string {
  try { return localStorage.getItem(POLY_TARGET_KEY) || ''; } catch { return ''; }
}

/** Wire-frame polyhedron glyphs for the seven die types. */
function dieIcon(sides: number): string {
  const open = '<svg viewBox="0 0 24 24" width="34" height="34" fill="rgba(139,124,255,.09)" stroke="#e8e4ff" stroke-width="1.2" stroke-linejoin="round">';
  const close = '</svg>';
  const shapes: Record<number, string> = {
    4: '<path d="M12 3 L21 19 L3 19 Z"/><path d="M12 3 L12 19 M3 19 L12 15 L21 19"/>',
    6: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9 L9 4 M20 9 L15 4 M9 4 L20 15"/>',
    8: '<path d="M12 2 L21 12 L12 22 L3 12 Z"/><path d="M3 12 L21 12 M12 2 L12 22"/>',
    10: '<path d="M12 2 L20 8 L12 22 L4 8 Z"/><path d="M4 8 L20 8 M12 2 L12 22"/>',
    12: '<path d="M12 2 L21 8 L18 20 L6 20 L3 8 Z"/><path d="M12 2 L12 11 M3 8 L12 11 L21 8 M6 20 L12 11 L18 20"/>',
    20: '<path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z"/><path d="M12 2 L18 12 L12 22 L6 12 Z M3 7 L12 12 L21 7 M3 17 L12 12 L21 17"/>',
    100: '<path d="M12 1 L14.5 7.5 L21.5 6 L17 12 L21.5 18 L14.5 16.5 L12 23 L9.5 16.5 L2.5 18 L7 12 L2.5 6 L9.5 7.5 Z"/>',
  };
  return open + (shapes[sides] || shapes[20]) + close;
}

function polyView(role: Role) {
  const isGM = role === 'GM';
  const wrap = el('div', { class: 'dp' });
  const last = loadPolyLast();
  let saved = loadPolySaved();
  let blindOnce = false;
  let forceVisible = false;
  let rollToken = 0;

  const exprInput = el('input', {
    class: 'dp-input', type: 'text', spellcheck: 'false',
    placeholder: '例如 2d6 + 1d20 + 5 或 adv(1d20)', value: last.expr,
    oninput: () => paintCounts(),
    onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') void doRoll(); },
  }) as HTMLInputElement;
  const noteInput = el('input', {
    class: 'dp-input', type: 'text', placeholder: '备注（可选，例如 偷袭）', value: last.note,
    onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') void doRoll(); },
  }) as HTMLInputElement;
  const targetInput = el('input', {
    class: 'dp-target-input', type: 'number', min: '1', placeholder: '—', value: loadTarget(),
    onchange: () => { try { localStorage.setItem(POLY_TARGET_KEY, targetInput.value); } catch { /* ignore */ } },
  }) as HTMLInputElement;
  const parseState = el('div', { class: 'dp-parse' });
  const savedRow = el('div', { class: 'dp-saved' });
  const resultBox = el('div', { class: 'result-box' });

  const tableChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  tableChk.checked = tableDiceOn();
  tableChk.disabled = !appState.embedded;
  tableChk.addEventListener('change', () => setTableDice(tableChk.checked));

  // GM-only rigged roll — hidden behind the "固定下次" button by default.
  const force = isGM ? forcePanel() : null;

  // ---- die grid ----
  const grid = el('div', { class: 'dp-grid' });
  const badges = new Map<number, HTMLElement>();
  for (const s of DIE_TYPES) {
    const badge = el('span', { class: 'dp-count' }, '');
    badges.set(s, badge);
    grid.append(el('button', {
      class: 'dp-die', type: 'button', title: `左键 +1d${s} · 右键 −1d${s}`,
      onclick: () => { setExpr(bumpGroup(exprInput.value, s, 1)); playSfx('click'); },
      oncontextmenu: (e: Event) => {
        e.preventDefault();
        setExpr(bumpGroup(exprInput.value, s, -1));
        playSfx('click');
      },
    },
      el('span', { class: 'dp-icon', html: dieIcon(s) }),
      el('span', { class: 'dp-label' }, `d${s}`),
      badge,
    ));
  }

  function setExpr(v: string) {
    exprInput.value = v;
    paintCounts();
  }

  function paintCounts() {
    const p = parseExpression(exprInput.value);
    for (const [s, badge] of badges) {
      const g = p.valid ? p.groups.find(x => x.sides === s) : undefined;
      badge.textContent = g ? `×${g.count}` : '';
      badge.classList.toggle('on', !!g);
      const cell = badge.parentElement;
      if (cell) cell.classList.toggle('active', !!g);
    }
    exprInput.classList.toggle('invalid', !p.valid);
    if (!p.valid) {
      parseState.textContent = `⚠ ${p.error}`;
      parseState.className = 'dp-parse bad';
    } else {
      const mode = p.adv === 'adv' ? ' · 优势取高' : p.adv === 'dis' ? ' · 劣势取低' : '';
      parseState.textContent = `✓ ${p.groups.reduce((n, g) => n + g.count, 0)} 颗骰子${mode}`;
      parseState.className = 'dp-parse ok';
    }
  }

  function renderSaved() {
    clear(savedRow);
    if (!saved.length) return;
    savedRow.append(el('span', { class: 'dp-saved-label' }, '已保存：'));
    for (const s of saved) {
      savedRow.append(el('span', { class: 'dp-chip' },
        el('button', { class: 'dp-chip-main', title: '点击载入', onclick: () => { setExpr(s); playSfx('click'); } }, s),
        el('button', { class: 'dp-chip-x', title: '删除', onclick: () => { saved = saved.filter(x => x !== s); savePolySaved(saved); renderSaved(); } }, '×'),
      ));
    }
  }

  // ---- buttons ----
  const blindBtn = el('button', { class: 'dp-toggle' }, '🔒 暗骰');
  blindBtn.addEventListener('click', () => {
    blindOnce = !blindOnce;
    blindBtn.classList.toggle('active', blindOnce);
    playSfx('click');
  });
  const globalBtn = el('button', { class: 'dp-toggle' + (globalBlindOn() ? ' active' : '') },
    `🌐 全局暗骰：${globalBlindOn() ? '开' : '关'}`);
  globalBtn.addEventListener('click', () => {
    const on = !globalBlindOn();
    setGlobalBlind(on);
    globalBtn.textContent = `🌐 全局暗骰：${on ? '开' : '关'}`;
    globalBtn.classList.toggle('active', on);
    playSfx('click');
  });
  const forceBtn = el('button', { class: 'dp-toggle wide' }, '');
  function paintForceBtn() {
    const v = isGM ? getForced() : null;
    forceBtn.textContent = v != null ? `🎯 固定下次：${v}` : '🎯 固定下次：关';
    forceBtn.classList.toggle('active', v != null || forceVisible);
  }
  forceBtn.addEventListener('click', () => {
    forceVisible = !forceVisible;
    if (force?.node) force.node.classList.toggle('is-hidden', !forceVisible);
    paintForceBtn();
    playSfx('click');
  });

  const forceBox = force ? force.node : null;
  if (forceBox) {
    forceBox.classList.add('is-hidden');
    // Keep the button label in sync when the GM sets / clears a value.
    const setBtn = forceBox.querySelector('.btn-mini');
    setBtn?.addEventListener('click', () => setTimeout(paintForceBtn, 30));
    forceBox.querySelectorAll('.btn-mini').forEach(b => b.addEventListener('click', () => setTimeout(paintForceBtn, 30)));
  }

  function saveCurrent() {
    const p = parseExpression(exprInput.value);
    if (!p.valid) { paintCounts(); return; }
    saved = [p.text, ...saved.filter(x => x !== p.text)].slice(0, 8);
    savePolySaved(saved);
    renderSaved();
    parseState.textContent = `✓ 已保存「${p.text}」`;
  }

  async function doRoll() {
    const p = parseExpression(exprInput.value);
    if (!p.valid) { paintCounts(); return; }
    const token = ++rollToken;
    const noteText = noteInput.value.trim();
    savePolyLast(p.text, noteText);

    // 指定点数：表达式里最大的骰面够大才消耗设定
    const biggest = maxSides(p);
    const pendingRig = isGM ? getForced() : null;
    const rig = isGM ? takeForced(biggest) : null;
    if (rig != null) force?.refresh(true);
    else if (pendingRig != null) force?.notifySkipped(biggest);
    paintForceBtn();

    const r = rollExpression(p, rig);
    const blind = isGM && (blindOnce || globalBlindOn());

    clear(resultBox);
    const stage = diceStage();
    resultBox.append(stage.wrap);
    playSfx('tumble');
    const shown = r.dice.slice(0, 6);
    await animateDice(
      stage.canvas,
      shown.map(d => ({ value: d.value, sides: d.sides, color: d.sides === 20 ? '#ffce5c' : '#8b7cff' })),
      { onBounce: () => playSfx('bounce') },
    );
    if (token !== rollToken) { stage.wrap.remove(); return; }

    const d20s = r.dice.filter(d => d.sides === 20).map(d => d.value);
    const nat = d20s.includes(20) ? 'nat20' : (r.dice.length === 1 && r.dice[0].value === 1) ? 'nat1' : null;
    playSfx(nat ?? 'bounce');

    const card = el('div', { class: 'result-card' });
    const row = el('div', { class: 'dice-row wrap' });
    for (const d of r.dice) row.append(dieBox(`d${d.sides}`, d.value, 'plain'));
    card.append(row);
    if (nat) {
      card.append(el('div', { class: `nat-badge ${nat === 'nat20' ? 'nat-20' : 'nat-1'}` },
        nat === 'nat20' ? '✦ 天然 20 · 大成功' : '✧ 天然 1 · 大失败'));
    }
    const calc = el('div', { class: 'calc' });
    calc.append(el('div', { class: 'calc-line' }, `${p.text} → ${diceDetail(p, r)}`));
    calc.append(el('div', { class: 'calc-total' }, `总计 = ${r.total}`));
    if (rig != null) calc.append(el('div', { class: 'calc-line', }, `🎯 指定点数 ${rig} 已生效`));
    const target = parseInt(targetInput.value, 10);
    if (Number.isFinite(target) && target > 0) {
      calc.append(el('div', { class: 'calc-line' }, `目标总数 ${target} → `,
        el('b', { class: r.total >= target ? 'ok' : 'bad' }, r.total >= target ? '达成' : '未达成')));
    }
    if (noteText) calc.append(el('div', { class: 'calc-line' }, `备注：${noteText}`));
    card.append(calc);
    resultBox.append(card);
    holdStage(stage.wrap, 2600);

    if (tableChk.checked && appState.embedded && !blind) {
      void castDiceToTable({
        dice: shown.slice(0, 3).map(d => ({ text: String(d.value), color: '#b3a7ff' })),
        note: `${appState.playerName || (isGM ? 'GM' : '玩家')} · ${p.text} · 总计 ${r.total}`,
      });
    }

    pushRoll({
      id: newId(), ts: Date.now(),
      author: appState.playerName || (isGM ? 'GM' : '玩家'),
      color: appState.playerColor || '#8b7cff',
      gmOnly: blind, kind: 'poly',
      summary: `${p.text} = ${r.total}${nat === 'nat20' ? ' · 天然 20' : nat === 'nat1' ? ' · 天然 1' : ''}`,
      detail: `${diceDetail(p, r)}${noteText ? ` ｜ ${noteText}` : ''}`,
    });
  }

  wrap.append(
    el('div', { class: 'dp-head' }, el('b', {}, '骰子'),
      el('span', { class: 'dp-sub' }, '左键 +1 · 右键 −1 · 也可直接编辑表达式')),
    grid,
    el('div', { class: 'dp-section' }, '表达式'),
    el('div', { class: 'dp-expr-row' }, exprInput,
      el('button', { class: 'dp-step', title: '调整值 −1', onclick: () => { setExpr(bumpModifier(exprInput.value, -1)); playSfx('click'); } }, '−'),
      el('button', { class: 'dp-step', title: '调整值 +1', onclick: () => { setExpr(bumpModifier(exprInput.value, 1)); playSfx('click'); } }, '+'),
      el('button', { class: 'dp-step adv', title: '切换 普通 / 优势 / 劣势', onclick: () => { setExpr(cycleAdv(exprInput.value)); playSfx('click'); } }, '优势'),
    ),
    parseState,
    noteInput,
    savedRow,
    el('div', { class: 'dp-actions' },
      el('button', { class: 'dp-btn primary', onclick: () => void doRoll() }, '投掷'),
      el('button', {
        class: 'dp-btn', title: '恢复上一次组合并直接重投',
        onclick: () => {
          const l = loadPolyLast();
          setExpr(l.expr);
          noteInput.value = l.note;
          void doRoll();
        },
      }, '上一次'),
      el('button', { class: 'dp-btn gold', title: '保存当前表达式', onclick: saveCurrent }, '保存组合'),
      el('button', {
        class: 'dp-btn danger',
        onclick: () => { setExpr(''); noteInput.value = ''; resultBox.replaceChildren(); playSfx('click'); },
      }, '清空'),
    ),
    isGM
      ? el('div', { class: 'dp-toggles' }, blindBtn, globalBtn)
      : el('div', { class: 'dp-hint' }, '暗骰与指定点数仅 GM 可用。'),
    el('div', { class: 'dp-toggles second' },
      el('label', { class: 'dp-target' }, '目标总数', targetInput),
      isGM ? forceBtn : null,
    ),
    forceBox,
    el('label', { class: 'check dp-table' + (appState.embedded ? '' : ' disabled') }, tableChk,
      el('span', {}, appState.embedded ? '投到桌面' : '投到桌面（需在枭雄内）')),
    resultBox,
  );

  paintCounts();
  renderSaved();
  paintForceBtn();
  return wrap;
}

// ---------------------------------------------------------------- quick rolls from the bestiary

type HitMode = 'none' | 'advantage' | 'disadvantage';
interface QuickState { mode: HitMode; critical: boolean }
/** Survives a tab switch, which rebuilds the whole queue DOM. */
const quickState = new Map<string, QuickState>();
function stateFor(id: string): QuickState {
  let s = quickState.get(id);
  if (!s) { s = { mode: 'none', critical: false }; quickState.set(id, s); }
  return s;
}

function quickRollsView(_role: Role) {
  const wrap = el('div', { class: 'quick-box' });
  const list = getQuickRolls();
  wrap.append(el('div', { class: 'quick-head' },
    el('span', {}, '⚔ 怪物卡快捷投掷'),
    list.length ? el('button', { class: 'quick-clear', onclick: () => clearQuickRolls() }, '清空') : null,
  ));
  if (!list.length) {
    wrap.append(el('div', { class: 'quick-empty' },
      '在怪物图鉴里点「命中 +1」或「1d8+3 物理」，对应的骰子组合会自动送到这里。'));
    return wrap;
  }
  for (const q of list) wrap.append(quickItem(q));
  return wrap;
}

function quickItem(q: QuickRoll) {
  const st = stateFor(q.id);
  const box = el('div', { class: 'quick-item' });
  const result = el('div', { class: 'quick-result' });
  const modeNote = el('div', { class: 'quick-note' });
  const critNote = el('div', { class: 'quick-note' });

  function paintNotes() {
    modeNote.textContent = q.kind === 'attack'
      ? st.mode === 'none'
        ? '匕首之心 · 敌人命中掷 1d20；优势/劣势时额外掷一颗 d20 取高/低。'
        : `匕首之心 · NPC ${st.mode === 'advantage' ? '优势' : '劣势'}：掷 2d20 取${st.mode === 'advantage' ? '最高' : '最低'}。`
      : '';
    critNote.textContent = q.kind === 'damage'
      ? st.critical
        ? `重击规则：照常掷 ${damageFormula(q.dice!)}，再额外加伤害骰最大值之和 ${criticalExtra(q.dice!)}（调整值只算一次）。`
        : `普通伤害：${damageFormula(q.dice!)}。重击按匕首之心规则额外加「所有伤害骰的最大值」。`
      : '';
  }
  paintNotes();

  box.append(el('div', { class: 'quick-top' },
    el('div', { class: 'quick-label' },
      el('span', { class: 'quick-kind ' + q.kind }, q.kind === 'attack' ? '命中' : '伤害'),
      el('b', {}, q.label),
    ),
    el('button', { class: 'quick-x', title: '从队列移除', onclick: () => removeQuickRoll(q.id) }, '×'),
  ));
  box.append(el('div', { class: 'quick-src' }, q.source));

  if (q.kind === 'attack') {
    const modes: [HitMode, string][] = [['none', '普通'], ['advantage', '优势'], ['disadvantage', '劣势']];
    const modeBtns: HTMLButtonElement[] = [];
    for (const [m, label] of modes) {
      const b = el('button', {
        class: 'quick-mode' + (st.mode === m ? ' active' : ''),
        onclick: () => {
          st.mode = m;
          modeBtns.forEach(x => x.classList.toggle('active', x.dataset.mode === m));
          paintNotes();
          playSfx('click');
        },
      }, label) as HTMLButtonElement;
      b.dataset.mode = m;
      modeBtns.push(b);
    }
    box.append(el('div', { class: 'quick-row' }, ...modeBtns,
      el('button', { class: 'btn primary quick-go', onclick: () => void doQuickAttack(q, st, result) }, '🎲 投掷命中')),
      modeNote);
  } else if (q.dice) {
    const critBtn = el('button', {
      class: 'quick-mode crit' + (st.critical ? ' active' : ''),
      onclick: () => {
        st.critical = !st.critical;
        critBtn.classList.toggle('active', st.critical);
        critBtn.textContent = st.critical ? '💥 重击 · 开' : '💥 重击 · 关';
        paintNotes();
        playSfx('click');
      },
    }, st.critical ? '💥 重击 · 开' : '💥 重击 · 关');
    box.append(el('div', { class: 'quick-row' }, critBtn,
      el('button', { class: 'btn primary quick-go', onclick: () => void doQuickDamage(q, st, result) }, '🎲 投掷伤害')),
      critNote);
  }

  box.append(result);
  return box;
}

function quickAuthor() {
  return appState.playerName || (appState.role === 'GM' ? 'GM' : '玩家');
}

async function doQuickAttack(q: QuickRoll, st: QuickState, result: HTMLElement) {
  const bonus = q.bonus ?? 0;
  const count = st.mode === 'none' ? 1 : 2;
  const r = rollPolyhedral(20, count, 0);
  const kept = st.mode === 'advantage' ? Math.max(...r.rolls)
    : st.mode === 'disadvantage' ? Math.min(...r.rolls) : r.rolls[0];
  const total = kept + bonus;
  const nat = kept === 20 ? 'nat20' : kept === 1 ? 'nat1' : null;

  clear(result);
  const stage = diceStage();
  result.append(stage.wrap);
  playSfx('tumble');
  await animateDice(stage.canvas, r.rolls.map(v => ({ value: v, sides: 20, color: '#8b7cff' })),
    { onBounce: () => playSfx('bounce') });
  playSfx(nat ?? 'bounce');

  const card = el('div', { class: 'result-card quick-card' });
  const row = el('div', { class: 'dice-row wrap' });
  for (const v of r.rolls) row.append(dieBox('d20', v, 'plain'));
  card.append(row);
  if (nat === 'nat20') {
    card.append(el('div', { class: 'nat-badge nat-20' }, '✦ 天然 20 · 关键成功 → 这一击的伤害可以勾选「重击」'));
  } else if (nat === 'nat1') {
    card.append(el('div', { class: 'nat-badge nat-1' }, '✧ 天然 1 · 大失败'));
  }
  const calc = el('div', { class: 'calc' });
  calc.append(el('div', { class: 'calc-line' }, st.mode === 'none'
    ? `1d20 → ${kept}`
    : `2d20 ${r.rolls.join(' / ')} → 取${st.mode === 'advantage' ? '高' : '低'} ${kept}`));
  calc.append(el('div', { class: 'calc-line' }, `命中加值 ${bonus >= 0 ? '+' : ''}${bonus}`));
  calc.append(el('div', { class: 'calc-total' }, `命中合计 = ${total}`));
  card.append(calc);
  result.append(card);
  holdStage(stage.wrap, 2600);

  pushRoll({
    id: newId(), ts: Date.now(), author: quickAuthor(),
    color: appState.playerColor || '#8b7cff', gmOnly: false, kind: 'poly',
    summary: `${q.source} · 命中 ${total}${nat === 'nat20' ? ' · 天然 20' : nat === 'nat1' ? ' · 天然 1' : ''}`,
    detail: `${st.mode === 'none' ? '1d20' : `2d20 取${st.mode === 'advantage' ? '高' : '低'}`} ${kept} + ${bonus} ｜ ${q.label}`,
  });
}

async function doQuickDamage(q: QuickRoll, st: QuickState, result: HTMLElement) {
  const d: DamageDice | undefined = q.dice;
  if (!d) return;
  const extra = st.critical ? criticalExtra(d) : 0;
  let rolls: number[] = [];
  let base = 0;
  if (d.count > 0) {
    const r = rollPolyhedral(d.sides, d.count, d.modifier);
    rolls = r.rolls;
    base = r.total;
  } else {
    base = d.flat + d.modifier;
  }
  const total = base + extra;

  clear(result);
  let stage: { wrap: HTMLElement; canvas: HTMLCanvasElement } | null = null;
  if (rolls.length) {
    stage = diceStage();
    result.append(stage.wrap);
    playSfx('tumble');
    await animateDice(stage.canvas, rolls.slice(0, 6).map(v => ({ value: v, sides: d.sides, color: '#ff8fb0' })),
      { onBounce: () => playSfx('bounce') });
    playSfx('bounce');
  }

  const card = el('div', { class: 'result-card quick-card' });
  if (rolls.length) {
    const row = el('div', { class: 'dice-row wrap' });
    for (const v of rolls) row.append(dieBox(`d${d.sides}`, v, 'plain'));
    card.append(row);
  }
  const calc = el('div', { class: 'calc' });
  calc.append(el('div', { class: 'calc-line' }, rolls.length
    ? `${damageFormula(d)} → ${rolls.join(' + ')}${d.modifier ? ` + ${d.modifier}` : ''} = ${base}`
    : `${damageFormula(d)} → 固定伤害 ${base}`));
  if (extra) {
    calc.append(el('div', { class: 'calc-line crit-line' },
      `💥 匕首之心重击：额外加伤害骰最大值之和 ${d.count} × ${d.sides} = ${extra}（调整值不重复计算）`));
  } else if (st.critical) {
    calc.append(el('div', { class: 'calc-line' }, '固定伤害没有伤害骰，重击不额外加成。'));
  }
  calc.append(el('div', { class: 'calc-total' }, `伤害合计 = ${total}`));
  card.append(calc);
  result.append(card);
  if (stage) holdStage(stage.wrap, 2600);

  pushRoll({
    id: newId(), ts: Date.now(), author: quickAuthor(),
    color: appState.playerColor || '#8b7cff', gmOnly: false, kind: 'poly',
    summary: `${q.source} · ${damageFormula(d)} = ${total}${extra ? ' · 重击' : ''}`,
    detail: rolls.length
      ? `${rolls.join(' + ')}${d.modifier ? ` + ${d.modifier}` : ''}${extra ? ` + 重击 ${extra}` : ''} = ${total} ｜ ${q.label}`
      : `固定伤害 ${base}${extra ? ` + 重击 ${extra}` : ''} = ${total} ｜ ${q.label}`,
  });
}

// ---------------------------------------------------------------- shared log

function rollLogView(role: Role) {
  const isGM = role === 'GM';
  const wrap = el('div', { class: 'roll-log' });
  const list = el('div', { class: 'log-list' });
  wrap.append(el('div', { class: 'log-title' }, '🎲 全场投掷记录'), list);

  function render() {
    clear(list);
    // Blind rolls only ever reach a GM's own client, but filter anyway so the
    // rule holds even if one arrives from a stale broadcast.
    const visible = rollLog.filter((e) => !e.gmOnly || isGM);
    if (!visible.length) {
      list.append(el('div', { class: 'log-empty' }, '还没有人投掷。'));
      return;
    }
    for (const e of visible) {
      list.append(
        el('div', { class: 'log-item' + (e.gmOnly ? ' blind' : '') },
          el('div', { class: 'log-top' },
            el('span', { class: 'log-author', style: `color:${e.color}` }, e.author),
            e.gmOnly ? el('span', { class: 'lock', title: '暗骰 · 仅你可见' }, '🔒 暗骰') : null,
            el('span', { class: 'log-time' }, timeStr(e.ts)),
          ),
          el('div', { class: 'log-sum' }, e.summary),
          el('div', { class: 'log-detail' }, e.detail),
          // GM-only line: this player roll pushed a point into the Fear pool.
          isGM && e.gmSettle ? el('div', { class: 'log-settle' }, '💀 ', e.gmSettle) : null,
        ),
      );
    }
  }

  render();
  onRollLogChange(render);
  return wrap;
}

function timeStr(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function field(label: string, control: HTMLElement) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}
