// GM-only adversary compendium for Daggerheart, shown as a second Owlbear action.
//
// All 139 adversaries from the Chinese SRD wiki are bundled as JSON, so the panel
// works offline and never has to fight CORS from inside the Owlbear iframe.
//
// Views served by this single page:
//   (default)               main compendium + encounter tracker + bound tokens
//   ?mode=picker&item=<id>  bind one scene token to an adversary (right-click)
//   ?mode=card              floating stat card, opened automatically on left-click
import OBR from '@owlbear-rodeo/sdk';
import './bestiary.css';
import { el, clear } from './dom';
import type { Role } from './types';
import rawEnemies from './data/enemies.json';
import {
  setupContextMenu, startAutoCard, openPicker, closePicker, showCardFor, closeCard,
  openBookModal, getBinding, setBinding, adjustBinding, listBoundTokens, onBindingsChange,
  rememberItemName, getCardTarget, getCardPos, moveCard, dockCard, startCardMessages,
  type Binding, type BoundToken, type CardTarget, type CardPos,
} from './tokenBinding';
import { sendQuickRoll, parseDamage, parseBonus, newQuickId } from './quickRolls';

interface Feature { name: string; desc: string }
interface Attack { bonus: string; weapon: string; range: string; damage: string; line: string }
interface Enemy {
  id: string; name: string; original: string; tier: number; type: string;
  difficulty: number; thresholds: (number | null)[]; hp: number; stress: number;
  attack: Attack | null; experiences: string; description: string; motives: string;
  tierNote: string; features: Feature[]; url: string;
}
interface Unit {
  uid: string; id: string; name: string; hp: number; hpMax: number;
  stress: number; stressMax: number; difficulty: number; tier: number;
}

const enemies = rawEnemies as Enemy[];
const TYPES = [...new Set(enemies.map(e => e.type))].sort((a, b) => a.localeCompare(b, 'zh'));
const ENC_KEY = 'dh_encounter_v1';

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'book';
const TARGET_ITEM = params.get('item') || '';
const TARGET_ENEMY = params.get('enemy') || '';
const TARGET_NAME = params.get('name') || '';
const CURRENT_ENEMY = params.get('current') || '';
const PICKER_HINT = params.get('hint') === '1';

let units: Unit[] = loadUnits();
let role: Role = 'GM';
let query = '';
let tier = 0;
let type = '';
let sort: 'tier' | 'difficulty' | 'name' = 'tier';
let selected: string | null = null;
let tab: 'book' | 'encounter' | 'tokens' = 'book';

let boundTokens: BoundToken[] = [];
let pickerQuery = '';
let pickerTier = 0;
let cardExpanded = false;
let cardTarget: CardTarget | null = null;
let drag: { active: boolean; startX: number; startY: number; pos: CardPos } | null = null;
let lastDragMove = 0;
let pendingPos: CardPos | null = null;

// ---------- persistence (memory first: Owlbear iframes may block localStorage) ----------
function loadUnits(): Unit[] {
  try {
    const raw = localStorage.getItem(ENC_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(u => u && typeof u.name === 'string');
    }
  } catch { /* storage blocked */ }
  return [];
}
function saveUnits() {
  try { localStorage.setItem(ENC_KEY, JSON.stringify(units)); } catch { /* keep in memory */ }
}
function uid() { return Math.random().toString(36).slice(2, 10); }

// ---------- helpers ----------
function toast(msg: string, tone: 'ok' | 'warn' = 'ok') {
  document.querySelectorAll('.be-toast').forEach(t => t.remove());
  const t = el('div', { class: `be-toast ${tone}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}
function rootEl(): HTMLElement { return document.getElementById('bestiary')!; }
function enemyById(id: string): Enemy | undefined { return enemies.find(e => e.id === id); }
function featureLabel(name: string): { text: string; cls: string } | null {
  const m = name.match(/-\s*(被动|动作|反应|恐惧特性|特殊)\s*$/);
  if (!m) return /恐惧/.test(name) ? { text: '恐惧', cls: 'fear' } : null;
  const map: Record<string, string> = { '被动': 'passive', '动作': 'action', '反应': 'reaction', '恐惧特性': 'fear', '特殊': 'special' };
  return { text: m[1], cls: map[m[1]] || 'passive' };
}
function cleanFeatureName(name: string) {
  return name.replace(/-\s*(被动|动作|反应|恐惧特性|特殊)\s*$/, '').trim();
}
function haystack(e: Enemy): string {
  return [e.name, e.original, e.type, e.description, e.motives, e.experiences,
    ...e.features.flatMap(f => [f.name, f.desc])].join(' ').toLowerCase();
}
const SEARCH = new Map(enemies.map(e => [e.id, haystack(e)]));

interface ListOpts { q: string; tier: number; type: string; sort: 'tier' | 'difficulty' | 'name' }
function filtered(o: Partial<ListOpts> = {}): Enemy[] {
  const q = (o.q ?? query).trim().toLowerCase();
  const t = o.tier ?? tier;
  const tp = o.type ?? type;
  const s = o.sort ?? sort;
  let out = enemies.filter(e =>
    (t === 0 || e.tier === t) &&
    (tp === '' || e.type === tp) &&
    (q === '' || (SEARCH.get(e.id) || '').includes(q)),
  );
  out = [...out].sort((a, b) => {
    if (s === 'difficulty') return a.difficulty - b.difficulty || a.tier - b.tier || a.name.localeCompare(b.name, 'zh');
    if (s === 'name') return a.name.localeCompare(b.name, 'zh');
    return a.tier - b.tier || a.difficulty - b.difficulty || a.name.localeCompare(b.name, 'zh');
  });
  return out;
}

function addUnit(e: Enemy) {
  units.push({ uid: uid(), id: e.id, name: e.name, hp: e.hp, hpMax: e.hp,
    stress: e.stress, stressMax: e.stress, difficulty: e.difficulty, tier: e.tier });
  saveUnits();
  toast(`「${e.name}」已加入遭遇`);
  render();
}
function adjust(u: Unit, field: 'hp' | 'stress', delta: number) {
  const max = field === 'hp' ? u.hpMax : u.stressMax;
  u[field] = Math.max(0, Math.min(max, u[field] + delta));
  saveUnits();
  render();
}

// ---------- send attack / damage formulas to the main dice panel ----------
function pushAttack(e: Enemy, part: 'hit' | 'damage', quiet = false): boolean {
  const a = e.attack;
  if (!a) return false;
  const source = `${e.name} · ${a.weapon || '攻击'}`;
  if (part === 'hit') {
    sendQuickRoll({
      id: newQuickId(), ts: Date.now(), source, kind: 'attack',
      label: `命中 ${a.bonus || '+0'}`, bonus: parseBonus(a.bonus),
    });
    if (!quiet) toast('已把「命中」加入投骰界面 · 可选普通 / 优势 / 劣势');
    return true;
  }
  const text = a.damage || a.line;
  const d = parseDamage(text);
  if (!d) { toast(`无法解析伤害「${text}」，请手动投掷`, 'warn'); return false; }
  sendQuickRoll({ id: newQuickId(), ts: Date.now(), source, kind: 'damage', label: text, dice: d });
  if (!quiet) toast('已把「伤害」加入投骰界面 · 可勾选「重击」');
  return true;
}
function pushBoth(e: Enemy) {
  const a = pushAttack(e, 'hit', true);
  const b = pushAttack(e, 'damage', true);
  if (a && b) toast('已把「命中 + 伤害」一起加入投骰界面');
}

// ---------- binding helpers ----------
async function refreshBoundTokens() { boundTokens = await listBoundTokens(); }
async function bindEnemyToSelection(e: Enemy) {
  if (!OBR.isAvailable) { toast('请在枭雄里选中一个头像后再绑定', 'warn'); return; }
  try {
    const sel = await OBR.player.getSelection();
    if (!sel || sel.length !== 1) { toast('请先在场景里选中恰好 1 个头像', 'warn'); return; }
    const itemId = sel[0];
    const items = await OBR.scene.items.getItems([itemId]);
    const name = items[0]?.name || '头像';
    rememberItemName(itemId, name);
    await setBinding(itemId, { enemyId: e.id, hp: e.hp, stress: e.stress });
    toast(`「${name}」已绑定 ${e.name} · 左键点它即可查看怪物卡`);
    await refreshBoundTokens();
    render();
  } catch {
    toast('绑定失败，请确认你是 GM 且头像未被锁定', 'warn');
  }
}
async function unbind(itemId: string) {
  await setBinding(itemId, null);
  await refreshBoundTokens();
  toast('已解除绑定');
}
async function itemDisplayName(itemId: string): Promise<string> {
  if (TARGET_NAME) return TARGET_NAME;
  if (!OBR.isAvailable) return itemId ? `头像 ${itemId.slice(0, 6)}` : '（预览头像）';
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return items[0]?.name || '未命名头像';
  } catch { return '未命名头像'; }
}
function loadCardTarget(): CardTarget | null {
  const t = getCardTarget();
  if (t) return t;
  if (TARGET_ITEM && TARGET_ENEMY) return { itemId: TARGET_ITEM, enemyId: TARGET_ENEMY, name: TARGET_NAME };
  return null;
}

// ---------- main compendium ----------
async function selectTab(id: typeof tab) {
  tab = id;
  if (id === 'tokens') await refreshBoundTokens();
  render();
}

function header() {
  return el('div', { class: 'be-header' },
    el('div', { class: 'be-title-row' },
      el('div', { class: 'be-title' }, '📖 怪物图鉴'),
      el('span', { class: 'be-role' }, role === 'GM' ? 'GM 专用' : '玩家'),
      el('div', { class: 'be-spacer' }),
      el('span', { class: 'be-head-tip' }, '左键点头像 → 怪物卡'),
    ),
    el('div', { class: 'be-sub' }, `《核心规则书》 ${enemies.length} 条敌人 · 点攻击数值即可送骰到投掷面板`),
    el('div', { class: 'be-tabs' },
      el('button', { class: 'be-tab' + (tab === 'book' ? ' active' : ''), onclick: () => void selectTab('book') }, '图鉴'),
      el('button', { class: 'be-tab' + (tab === 'encounter' ? ' active' : ''), onclick: () => void selectTab('encounter') },
        `遭遇 ${units.length ? `(${units.length})` : ''}`),
      el('button', { class: 'be-tab' + (tab === 'tokens' ? ' active' : ''), onclick: () => void selectTab('tokens') },
        `场上 ${boundTokens.length ? `(${boundTokens.length})` : ''}`),
    ),
  );
}

function toolbar() {
  const search = el('input', {
    class: 'be-search', type: 'search', placeholder: '搜索名称 / 原文 / 特性 / 描述…', value: query,
    oninput: (e: Event) => { query = (e.target as HTMLInputElement).value; renderListOnly(); },
  }) as HTMLInputElement;
  const tierBar = el('div', { class: 'be-chips' });
  for (const t of [0, 1, 2, 3, 4]) {
    tierBar.append(el('button', {
      class: 'be-chip' + (tier === t ? ' active' : ''),
      onclick: () => { tier = t; render(); },
    }, t === 0 ? '全部位阶' : `位阶 ${t}`));
  }
  const typeSel = el('select', {
    class: 'be-select',
    onchange: (e: Event) => { type = (e.target as HTMLSelectElement).value; render(); },
  }) as HTMLSelectElement;
  typeSel.append(el('option', { value: '' }, '全部种类'));
  for (const t of TYPES) typeSel.append(el('option', { value: t }, t));
  typeSel.value = type;
  const sortSel = el('select', {
    class: 'be-select',
    onchange: (e: Event) => { sort = (e.target as HTMLSelectElement).value as typeof sort; render(); },
  }) as HTMLSelectElement;
  for (const [v, label] of [['tier', '按位阶'], ['difficulty', '按难度'], ['name', '按名称']] as const) {
    sortSel.append(el('option', { value: v }, label));
  }
  sortSel.value = sort;
  return el('div', { class: 'be-toolbar' }, search, tierBar,
    el('div', { class: 'be-select-row' }, typeSel, sortSel, el('span', { class: 'be-count' }, '')));
}

function listItem(e: Enemy) {
  return el('button', {
    class: 'be-item' + (selected === e.id ? ' active' : ''),
    onclick: () => { selected = e.id; render(); },
  },
    el('div', { class: 'be-item-top' },
      el('span', { class: `be-tier t${e.tier}` }, `T${e.tier}`),
      el('span', { class: 'be-item-name' }, e.name),
      el('span', { class: 'be-item-diff' }, `难度 ${e.difficulty}`),
    ),
    el('div', { class: 'be-item-sub' },
      el('span', {}, e.type), el('span', { class: 'be-dot' }, '·'),
      el('span', {}, `HP ${e.hp}`), el('span', { class: 'be-dot' }, '·'),
      el('span', {}, `压力 ${e.stress}`),
    ),
    el('div', { class: 'be-item-en' }, e.original),
  );
}
function listPane(): HTMLElement { return el('div', { class: 'be-list', id: 'be-list' }); }
function renderListInto(list: HTMLElement) {
  clear(list);
  const rows = filtered();
  const count = document.querySelector('.be-count');
  if (count) count.textContent = `${rows.length} / ${enemies.length} 条`;
  if (!rows.length) {
    list.append(el('div', { class: 'be-empty' }, '没有匹配的敌人，换个关键词或筛选条件试试。'));
    return;
  }
  for (const e of rows) list.append(listItem(e));
}
function renderListOnly() {
  const list = document.getElementById('be-list');
  if (list) renderListInto(list as HTMLElement);
}
function stat(label: string, value: string, cls = '') {
  return el('div', { class: `be-stat ${cls}` },
    el('div', { class: 'be-stat-label' }, label),
    el('div', { class: 'be-stat-value' }, value));
}

function detailPane(): HTMLElement {
  const pane = el('div', { class: 'be-detail' });
  const e = enemies.find(x => x.id === selected);
  if (!e) {
    pane.append(el('div', { class: 'be-placeholder' },
      el('div', { class: 'be-ph-icon' }, '📖'),
      el('div', { class: 'be-ph-title' }, '从左侧选一个敌人'),
      el('div', { class: 'be-ph-text' }, '可以看到它的难度、阈值、攻击、经历与全部特性。点攻击或命中数值可把骰子组合送到主插件的投掷面板。'),
    ));
    return pane;
  }

  pane.append(el('div', { class: 'be-d-head' },
    el('div', { class: 'be-d-title' }, e.name),
    el('div', { class: 'be-d-en' }, e.original),
    el('div', { class: 'be-d-tags' },
      el('span', { class: `be-tier t${e.tier}` }, `位阶 ${e.tier}`),
      el('span', { class: 'be-tag' }, e.type),
      e.tierNote ? el('span', { class: 'be-tag', title: e.tierNote }, e.tierNote.slice(0, 18)) : null,
      el('span', { class: 'be-tag src' }, '《核心规则书》'),
    ),
    e.description ? el('div', { class: 'be-d-desc' }, e.description) : null,
    e.motives ? el('div', { class: 'be-d-motive' }, el('b', {}, '动机与战术：'), e.motives) : null,
  ));

  const th = e.thresholds || [];
  pane.append(el('div', { class: 'be-stats' },
    stat('难度', String(e.difficulty), 'accent'),
    stat('阈值', th[0] == null && th[1] == null ? '无' : `${th[0] ?? '无'} / ${th[1] ?? '无'}`),
    stat('生命点', String(e.hp), 'hp'),
    stat('压力点', String(e.stress), 'stress'),
  ));

  if (e.attack) {
    const a = e.attack;
    pane.append(el('div', { class: 'be-attack' },
      el('div', { class: 'be-sec-title' }, '⚔ 攻击 · 点数值送骰'),
      el('div', { class: 'be-attack-row' },
        el('div', { class: 'be-attack-main' },
          el('b', {}, a.weapon || '普通攻击'),
          el('span', { class: 'be-attack-range' }, a.range),
        ),
        el('button', { class: 'be-attack-dmg as-link', title: '点击把伤害骰加入投掷面板', onclick: () => pushAttack(e, 'damage') },
          a.damage || a.line),
        el('button', { class: 'be-attack-bonus as-link', title: '点击把命中检定加入投掷面板', onclick: () => pushAttack(e, 'hit') },
          a.bonus ? `命中 ${a.bonus}` : '命中 +0'),
      ),
      el('div', { class: 'be-attack-extra' },
        el('button', { class: 'be-roll-link both', onclick: () => pushBoth(e) }, '⚔ 命中 + 伤害 一起加入'),
        el('span', { class: 'be-roll-hint' }, '命中可选普通 / 优势 / 劣势，伤害可勾选匕首之心重击。'),
      ),
    ));
  }
  if (e.experiences) pane.append(el('div', { class: 'be-exp' }, el('b', {}, '经历：'), e.experiences));

  if (e.features.length) {
    const box = el('div', { class: 'be-features' });
    box.append(el('div', { class: 'be-sec-title' }, `✦ 特性 · ${e.features.length}`));
    for (const f of e.features) {
      const tag = featureLabel(f.name);
      box.append(el('div', { class: 'be-feature' },
        el('div', { class: 'be-feature-name' }, cleanFeatureName(f.name),
          tag ? el('span', { class: `be-ftag ${tag.cls}` }, tag.text) : null),
        f.desc ? el('div', { class: 'be-feature-desc' }, f.desc) : null,
      ));
    }
    pane.append(box);
  }

  pane.append(el('div', { class: 'be-actions' },
    el('button', { class: 'be-btn primary', onclick: () => addUnit(e) }, '＋ 加入遭遇'),
    el('button', { class: 'be-btn', onclick: () => void bindEnemyToSelection(e) }, '🔗 绑定选中头像'),
    el('button', { class: 'be-btn ghost', onclick: () => window.open(e.url, '_blank', 'noopener') }, '↗ 维基原文'),
  ));
  return pane;
}

function encounterPane(): HTMLElement {
  const pane = el('div', { class: 'be-encounter' });
  pane.append(el('div', { class: 'be-enc-head' },
    el('div', {}, el('div', { class: 'be-sec-title' }, '⚔ 本场遭遇'),
      el('div', { class: 'be-hint' }, '记录场上敌人的生命点与压力点，只存在 GM 本机，关掉面板也不会丢。')),
    units.length
      ? el('button', { class: 'be-btn ghost small', onclick: () => { units = []; saveUnits(); render(); } }, '清空')
      : null,
  ));
  if (!units.length) {
    pane.append(el('div', { class: 'be-empty' }, '还没有敌人。在图鉴里点「＋ 加入遭遇」就能把敌人放进来。'));
    return pane;
  }
  for (const u of units) {
    const down = u.hp === 0;
    pane.append(el('div', { class: 'be-unit' + (down ? ' down' : '') },
      el('div', { class: 'be-unit-top' },
        el('span', { class: `be-tier t${u.tier}` }, `T${u.tier}`),
        el('span', { class: 'be-unit-name' }, u.name),
        down ? el('span', { class: 'be-down' }, '已倒下') : null,
        el('div', { class: 'be-spacer' }),
        el('span', { class: 'be-unit-diff' }, `难度 ${u.difficulty}`),
        el('button', { class: 'be-x', title: '移除', onclick: () => { units = units.filter(x => x.uid !== u.uid); saveUnits(); render(); } }, '×'),
      ),
      el('div', { class: 'be-track' },
        el('span', { class: 'be-track-label hp' }, '生命'),
        el('button', { class: 'be-step', onclick: () => adjust(u, 'hp', -1) }, '−'),
        el('span', { class: 'be-track-val' }, `${u.hp} / ${u.hpMax}`),
        el('button', { class: 'be-step', onclick: () => adjust(u, 'hp', 1) }, '+'),
        el('div', { class: 'be-bar' }, el('div', { class: 'be-bar-fill hp', style: `width:${u.hpMax ? (u.hp / u.hpMax) * 100 : 0}%` })),
      ),
      el('div', { class: 'be-track' },
        el('span', { class: 'be-track-label stress' }, '压力'),
        el('button', { class: 'be-step', onclick: () => adjust(u, 'stress', -1) }, '−'),
        el('span', { class: 'be-track-val' }, `${u.stress} / ${u.stressMax}`),
        el('button', { class: 'be-step', onclick: () => adjust(u, 'stress', 1) }, '+'),
        el('div', { class: 'be-bar' }, el('div', { class: 'be-bar-fill stress', style: `width:${u.stressMax ? (u.stress / u.stressMax) * 100 : 0}%` })),
      ),
      el('div', { class: 'be-unit-actions' },
        el('button', { class: 'be-link', onclick: () => { selected = u.id; tab = 'book'; render(); } }, '查看图鉴'),
      ),
    ));
  }
  return pane;
}

function tokensPane(): HTMLElement {
  const pane = el('div', { class: 'be-tokens' });
  pane.append(el('div', { class: 'be-enc-head' },
    el('div', {}, el('div', { class: 'be-sec-title' }, '🎭 场上头像'),
      el('div', { class: 'be-hint' }, '右键头像 →「绑定怪物图鉴」。之后左键点它，怪物卡会自动浮出；按住卡片标题栏可拖动，也能一键停靠四角。')),
    boundTokens.length
      ? el('button', { class: 'be-btn ghost small', onclick: () => { void (async () => { for (const t of boundTokens) await setBinding(t.itemId, null); await refreshBoundTokens(); render(); })(); } }, '全部解绑')
      : null,
  ));
  if (!boundTokens.length) {
    pane.append(el('div', { class: 'be-empty' }, '还没有绑定头像。\n选中一个怪物头像 → 右键 → 点链条图标，就能把它和图鉴条目绑起来。'));
    return pane;
  }
  for (const t of boundTokens) {
    const e = enemyById(t.binding.enemyId);
    const hpMax = e?.hp ?? Math.max(t.binding.hp, 1);
    const stressMax = e?.stress ?? Math.max(t.binding.stress, 1);
    pane.append(el('div', { class: 'be-unit' + (t.binding.hp === 0 ? ' down' : '') },
      el('div', { class: 'be-unit-top' },
        el('span', { class: 'be-avatar-tag' }, '头像'),
        el('span', { class: 'be-unit-name' }, t.name),
        el('span', { class: 'be-arrow' }, '→'),
        e ? el('span', { class: `be-tier t${e.tier}` }, `T${e.tier}`) : null,
        el('span', { class: 'be-unit-name' }, e?.name || '条目已失效'),
        el('div', { class: 'be-spacer' }),
        e ? el('span', { class: 'be-unit-diff' }, `难度 ${e.difficulty}`) : null,
      ),
      el('div', { class: 'be-track' },
        el('span', { class: 'be-track-label hp' }, '生命'),
        el('button', { class: 'be-step', onclick: () => void adjustBinding(t.itemId, 'hp', -1, hpMax).then(() => void refreshBoundTokens().then(render)) }, '−'),
        el('span', { class: 'be-track-val' }, `${t.binding.hp} / ${hpMax}`),
        el('button', { class: 'be-step', onclick: () => void adjustBinding(t.itemId, 'hp', 1, hpMax).then(() => void refreshBoundTokens().then(render)) }, '+'),
        el('div', { class: 'be-bar' }, el('div', { class: 'be-bar-fill hp', style: `width:${hpMax ? (t.binding.hp / hpMax) * 100 : 0}%` })),
      ),
      el('div', { class: 'be-track' },
        el('span', { class: 'be-track-label stress' }, '压力'),
        el('button', { class: 'be-step', onclick: () => void adjustBinding(t.itemId, 'stress', -1, stressMax).then(() => void refreshBoundTokens().then(render)) }, '−'),
        el('span', { class: 'be-track-val' }, `${t.binding.stress} / ${stressMax}`),
        el('button', { class: 'be-step', onclick: () => void adjustBinding(t.itemId, 'stress', 1, stressMax).then(() => void refreshBoundTokens().then(render)) }, '+'),
        el('div', { class: 'be-bar' }, el('div', { class: 'be-bar-fill stress', style: `width:${stressMax ? (t.binding.stress / stressMax) * 100 : 0}%` })),
      ),
      el('div', { class: 'be-unit-actions' },
        e ? el('button', { class: 'be-link', onclick: () => void showCardFor(t.itemId, e.id, t.name) }, '打开怪物卡') : null,
        el('button', { class: 'be-link', onclick: () => void openPicker(t.itemId, t.binding.enemyId, false, t.name) }, '更换绑定'),
        el('button', { class: 'be-link danger', onclick: () => void unbind(t.itemId).then(render) }, '解除绑定'),
      ),
    ));
  }
  return pane;
}

function render() {
  const root = rootEl();
  clear(root);
  const body = el('div', { class: 'be-body' });
  if (tab === 'book') {
    const list = listPane();
    body.append(list, detailPane());
    root.append(header(), toolbar(), body);
    renderListInto(list);
  } else {
    root.append(header(), body);
    body.append(tab === 'encounter' ? encounterPane() : tokensPane());
  }
}

// ---------- picker (opened as a modal from the right-click menu) ----------
async function chooseEnemy(e: Enemy) {
  if (!OBR.isAvailable) rememberItemName(TARGET_ITEM, await itemDisplayName(TARGET_ITEM));
  await setBinding(TARGET_ITEM, { enemyId: e.id, hp: e.hp, stress: e.stress });
  toast(`已绑定「${e.name}」· 左键点头像即可查看怪物卡`);
  if (OBR.isAvailable) {
    await closePicker();
  } else {
    const r = rootEl();
    clear(r);
    r.append(el('div', { class: 'be-done' },
      el('div', { class: 'be-done-icon' }, '✅'),
      el('div', { class: 'be-done-title' }, `已绑定「${e.name}」`),
      el('div', { class: 'be-done-text' }, '回到枭雄，左键点这个头像，怪物卡会自动浮出来。'),
      el('button', { class: 'be-btn primary', onclick: () => void renderPicker() }, '继续绑定其它头像'),
    ));
  }
}

async function renderPicker() {
  const r = rootEl();
  const name = await itemDisplayName(TARGET_ITEM);
  const current = CURRENT_ENEMY ? enemyById(CURRENT_ENEMY) : undefined;
  clear(r);
  const search = el('input', {
    class: 'be-search', type: 'search', placeholder: '搜索名称 / 原文 / 特性…', value: pickerQuery,
    oninput: (ev: Event) => {
      pickerQuery = (ev.target as HTMLInputElement).value;
      const list = document.getElementById('be-picker-list');
      if (list) renderPickerRows(list as HTMLElement);
    },
  }) as HTMLInputElement;
  const chips = el('div', { class: 'be-chips' });
  for (const t of [0, 1, 2, 3, 4]) {
    chips.append(el('button', {
      class: 'be-chip' + (pickerTier === t ? ' active' : ''),
      onclick: () => { pickerTier = t; void renderPicker(); },
    }, t === 0 ? '全部位阶' : `位阶 ${t}`));
  }
  const head = el('div', { class: 'be-picker-head' },
    el('div', { class: 'be-title-row' },
      el('div', { class: 'be-title' }, '🔗 绑定怪物图鉴'),
      el('div', { class: 'be-spacer' }),
      el('button', { class: 'be-btn ghost small', onclick: () => void closePicker() }, '✕ 取消'),
    ),
    el('div', { class: 'be-picker-target' }, '目标头像：', el('b', {}, name)),
    current
      ? el('div', { class: 'be-picker-current' }, '当前绑定：', el('b', {}, current.name),
        el('button', { class: 'be-link danger', onclick: () => void unbind(TARGET_ITEM).then(() => void closePicker()) }, '解除绑定'))
      : null,
    PICKER_HINT ? el('div', { class: 'be-picker-hint' }, '这个头像还没绑定怪物。先选一条，之后左键点它就能直接看怪物卡。') : null,
    search, chips,
  );
  const list = el('div', { class: 'be-picker-list', id: 'be-picker-list' });
  r.append(head, list, el('div', { class: 'be-picker-foot' },
    el('span', {}, '绑定信息保存在头像上，随场景同步；只有 GM 能看见右键绑定菜单。'),
  ));
  renderPickerRows(list);
}

function renderPickerRows(list: HTMLElement) {
  clear(list);
  const rows = filtered({ q: pickerQuery, tier: pickerTier, type: '', sort: 'tier' });
  if (!rows.length) { list.append(el('div', { class: 'be-empty' }, '没有匹配的敌人，换个关键词试试。')); return; }
  for (const e of rows) {
    list.append(el('button', {
      class: 'be-picker-item' + (e.id === CURRENT_ENEMY ? ' current' : ''),
      onclick: () => void chooseEnemy(e),
    },
      el('div', { class: 'be-item-top' },
        el('span', { class: `be-tier t${e.tier}` }, `T${e.tier}`),
        el('span', { class: 'be-item-name' }, e.name),
        e.id === CURRENT_ENEMY ? el('span', { class: 'be-current-tag' }, '当前') : null,
        el('span', { class: 'be-item-diff' }, `难度 ${e.difficulty}`),
      ),
      el('div', { class: 'be-item-sub' },
        el('span', {}, e.type), el('span', { class: 'be-dot' }, '·'),
        el('span', {}, `HP ${e.hp}`), el('span', { class: 'be-dot' }, '·'),
        el('span', {}, `压力 ${e.stress}`), el('span', { class: 'be-dot' }, '·'),
        el('span', {}, `${e.features.length} 个特性`),
      ),
      el('div', { class: 'be-item-en' }, e.original),
    ));
  }
}

// ---------- floating stat card ----------
function trackRow(label: string, cls: string, value: number, max: number, onStep: (d: number) => void) {
  return el('div', { class: 'be-track' },
    el('span', { class: `be-track-label ${cls}` }, label),
    el('button', { class: 'be-step', onclick: () => onStep(-1) }, '−'),
    el('span', { class: 'be-track-val' }, `${value} / ${max}`),
    el('button', { class: 'be-step', onclick: () => onStep(1) }, '+'),
    el('div', { class: 'be-bar' }, el('div', { class: `be-bar-fill ${cls}`, style: `width:${max ? (value / max) * 100 : 0}%` })),
  );
}

function wireCardDrag(handle: HTMLElement) {
  handle.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    drag = { active: true, startX: ev.clientX, startY: ev.clientY, pos: getCardPos() ?? { left: 0, top: 0 } };
    try { handle.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!drag?.active) return;
    pendingPos = {
      left: drag.pos.left + (ev.clientX - drag.startX),
      top: drag.pos.top + (ev.clientY - drag.startY),
    };
    const now = Date.now();
    if (now - lastDragMove > 90) {
      lastDragMove = now;
      void moveCard(pendingPos.left, pendingPos.top);
    }
  });
  const finish = (ev: PointerEvent) => {
    if (!drag?.active) return;
    drag.active = false;
    handle.classList.remove('dragging');
    try { handle.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (pendingPos) void moveCard(pendingPos.left, pendingPos.top);
    pendingPos = null;
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

async function renderCard() {
  const r = rootEl();
  clear(r);
  const itemId = cardTarget?.itemId || TARGET_ITEM;
  const name = cardTarget?.name || TARGET_NAME || await itemDisplayName(itemId);

  const binding = itemId ? await getBinding(itemId) : null;
  let e: Enemy | undefined;
  let b: Binding | null = null;
  if (binding) {
    e = enemyById(binding.enemyId);
    b = binding;
  } else if (!OBR.isAvailable) {
    // Preview fallback only. Inside Owlbear an unbound token must stay unbound,
    // otherwise "解除绑定" would be undone by the next card refresh.
    const e0 = enemyById(cardTarget?.enemyId || TARGET_ENEMY);
    if (e0) {
      b = { enemyId: e0.id, hp: e0.hp, stress: e0.stress };
      await setBinding(itemId, b);
      e = e0;
    }
  }
  if (!e || !b) {
    r.append(el('div', { class: 'be-card-empty' },
      el('div', { class: 'be-ph-icon' }, '🔗'),
      el('div', { class: 'be-ph-title' }, '这个头像还没绑定怪物'),
      el('div', { class: 'be-ph-text' }, '右键它 →「绑定怪物图鉴」，之后左键点它就会自动浮出怪物卡。'),
      el('button', { class: 'be-btn primary', onclick: () => void openPicker(itemId) }, '去绑定'),
      el('button', { class: 'be-btn ghost small', onclick: () => void closeCard() }, '关闭'),
    ));
    return;
  }

  const th = e.thresholds || [];
  const step = (field: 'hp' | 'stress', delta: number) => {
    void adjustBinding(itemId, field, delta, field === 'hp' ? e.hp : e.stress).then(() => void renderCard());
  };

  const dockBtn = (arrow: string, label: string, corner: 'tl' | 'tr' | 'bl' | 'br') =>
    el('button', { class: 'be-dock', title: `停靠${label}`, onclick: () => void dockCard(corner) }, arrow);
  const top = el('div', { class: 'be-card-top' },
    el('span', { class: 'be-drag-grip', title: '按住这里拖动浮窗' }, '⠿'),
    el('span', { class: 'be-avatar-tag' }, `🎭 ${name}`),
    el('div', { class: 'be-spacer' }),
    el('div', { class: 'be-docks' },
      dockBtn('↖', '左上', 'tl'), dockBtn('↗', '右上', 'tr'),
      dockBtn('↙', '左下', 'bl'), dockBtn('↘', '右下', 'br')),
    el('button', { class: 'be-x', title: '关闭', onclick: () => void closeCard() }, '×'),
  );

  const head = el('div', { class: 'be-card-head' },
    el('div', { class: 'be-d-title' }, e.name),
    el('div', { class: 'be-d-en' }, e.original),
    el('div', { class: 'be-d-tags' },
      el('span', { class: `be-tier t${e.tier}` }, `位阶 ${e.tier}`),
      el('span', { class: 'be-tag' }, e.type),
      el('span', { class: 'be-tag src' }, '《核心规则书》'),
    ),
  );

  const diff = el('div', { class: 'be-card-diff' },
    el('div', { class: 'be-card-diff-num' }, String(e.difficulty)),
    el('div', { class: 'be-card-diff-label' }, '该敌人的对抗难度'),
    el('div', { class: 'be-spacer' }),
    el('span', { class: 'be-card-diff-tip' }, '数值仅作参考'),
  );

  const stats = el('div', { class: 'be-stats compact' },
    stat('阈值', th[0] == null && th[1] == null ? '无' : `${th[0] ?? '无'} / ${th[1] ?? '无'}`),
    stat('攻击', e.attack ? (e.attack.damage || e.attack.line).slice(0, 14) : '无', 'hp'),
  );
  const tracks = el('div', { class: 'be-card-tracks' },
    trackRow('生命', 'hp', b.hp, e.hp, d => step('hp', d)),
    trackRow('压力', 'stress', b.stress, e.stress, d => step('stress', d)),
  );

  const info = el('div', { class: 'be-card-info' });
  if (e.attack) {
    const a = e.attack;
    info.append(el('div', { class: 'be-card-line' }, el('b', {}, '⚔ '), a.weapon || '普通攻击', ' · ', a.range));
    info.append(el('div', { class: 'be-roll-links compact' },
      el('button', { class: 'be-roll-link hit', onclick: () => pushAttack(e, 'hit') }, '🎯 命中 ', a.bonus || '+0'),
      el('button', { class: 'be-roll-link dmg', onclick: () => pushAttack(e, 'damage') }, '🎲 ', a.damage || a.line),
      el('button', { class: 'be-roll-link both', onclick: () => pushBoth(e) }, '⚔ 一起加入'),
    ));
  }
  if (e.experiences) info.append(el('div', { class: 'be-card-line' }, el('b', {}, '经历：'), e.experiences));
  if (e.description) info.append(el('div', { class: 'be-card-desc' }, e.description));
  if (e.motives) info.append(el('div', { class: 'be-card-desc' }, el('b', {}, '动机与战术：'), e.motives));

  const features = el('div', { class: 'be-card-features' });
  const shown = cardExpanded ? e.features : e.features.slice(0, 3);
  for (const f of shown) {
    const tag = featureLabel(f.name);
    features.append(el('div', { class: 'be-feature' },
      el('div', { class: 'be-feature-name' }, cleanFeatureName(f.name),
        tag ? el('span', { class: `be-ftag ${tag.cls}` }, tag.text) : null),
      f.desc ? el('div', { class: 'be-feature-desc' }, f.desc) : null,
    ));
  }
  if (e.features.length > 3) {
    features.append(el('button', { class: 'be-link', onclick: () => { cardExpanded = !cardExpanded; void renderCard(); } },
      cardExpanded ? '▲ 收起特性' : `▼ 展开全部 ${e.features.length} 个特性`));
  }

  const actions = el('div', { class: 'be-card-actions' },
    el('button', { class: 'be-btn', onclick: () => void openPicker(itemId, e.id, false, name) }, '🔁 更换绑定'),
    el('button', { class: 'be-btn', onclick: () => void openBookModal() }, '📖 完整图鉴'),
    el('button', { class: 'be-btn ghost', onclick: () => window.open(e.url, '_blank', 'noopener') }, '↗ 维基'),
    el('button', { class: 'be-btn ghost danger', onclick: () => void unbind(itemId).then(() => void closeCard()) }, '✕ 解除绑定'),
  );

  r.append(top, head, diff, stats, tracks, info, features, actions);
  wireCardDrag(top);
}

function denied() {
  const root = rootEl();
  clear(root);
  root.append(el('div', { class: 'be-denied' },
    el('div', { class: 'be-denied-icon' }, '🔒'),
    el('div', { class: 'be-denied-title' }, '仅 GM 可用'),
    el('div', { class: 'be-denied-text' }, '怪物图鉴包含敌人的数值、特性与动机战术。玩家端不会加载任何敌人数据，右键绑定菜单与左键怪物卡也只对 GM 生效。'),
  ));
}

async function detectRole(): Promise<Role> {
  const override = new URLSearchParams(location.search).get('role');
  if (override === 'gm' || override === 'player') return override === 'gm' ? 'GM' : 'PLAYER';
  if (!OBR.isAvailable) return 'GM';
  try {
    await Promise.race([
      new Promise<void>(res => OBR.onReady(() => res())),
      new Promise<void>(res => setTimeout(res, 3000)),
    ]);
    return await OBR.player.getRole();
  } catch { return 'GM'; }
}

async function boot() {
  role = await detectRole();
  const r = rootEl();
  r.className = `be-mode-${MODE}`;
  if (role !== 'GM') { denied(); return; }

  if (MODE === 'picker') { void renderPicker(); return; }

  if (MODE === 'card') {
    cardTarget = loadCardTarget();
    let lastSwitchSig = JSON.stringify(cardTarget);
    startCardMessages((m) => {
      if (m.type !== 'switch') return;
      const sig = JSON.stringify(m.target);
      if (sig === lastSwitchSig) return;
      lastSwitchSig = sig;
      cardTarget = m.target;
      cardExpanded = false;
      void renderCard();
    });
    void renderCard();
    const watchedItem = () => cardTarget?.itemId || TARGET_ITEM;
    let lastSig = JSON.stringify(await getBinding(watchedItem()));
    let cardTimer: number | undefined;
    onBindingsChange(() => {
      if (drag?.active) return;
      window.clearTimeout(cardTimer);
      cardTimer = window.setTimeout(async () => {
        const sig = JSON.stringify(await getBinding(watchedItem()));
        if (sig === lastSig) return;
        lastSig = sig;
        void renderCard();
      }, 180);
    });
    return;
  }

  // The main compendium iframe also owns the right-click menu and the
  // left-click auto-card listener — both survive the panel being closed.
  if (OBR.isAvailable) {
    await new Promise<void>(res => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      try { OBR.onReady(finish); } catch { finish(); }
      setTimeout(finish, 2500);
    });
    try { await setupContextMenu(role); } catch (err) { console.warn('bestiary: context menu unavailable', err); }
    try { startAutoCard(role); } catch (err) { console.warn('bestiary: auto card unavailable', err); }
  }

  let boundTimer: number | undefined;
  onBindingsChange(() => {
    if (tab !== 'tokens') return;
    window.clearTimeout(boundTimer);
    boundTimer = window.setTimeout(() => void refreshBoundTokens().then(render), 180);
  });
  await refreshBoundTokens();
  render();
}

boot();
