// GM-only adversary compendium for Daggerheart, shown as a second Owlbear action.
//
// All 139 adversaries from the Chinese SRD wiki are bundled as JSON, so the panel
// works offline and never has to fight CORS from inside the Owlbear iframe.
import OBR from '@owlbear-rodeo/sdk';
import './bestiary.css';
import { el, clear } from './dom';
import type { Role } from './types';
import { getDifficulty, onDifficulty, setDifficulty, startDifficulty } from './difficulty';
import rawEnemies from './data/enemies.json';

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

let units: Unit[] = loadUnits();
let role: Role = 'GM';
let query = '';
let tier = 0;
let type = '';
let sort: 'tier' | 'difficulty' | 'name' = 'tier';
let selected: string | null = null;
let tab: 'book' | 'encounter' = 'book';
let sharedDiff: number | null = getDifficulty();

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
  // Only one toast at a time — otherwise rapid clicks stack them on top of each other.
  document.querySelectorAll('.be-toast').forEach(t => t.remove());
  const t = el('div', { class: `be-toast ${tone}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

function diffLabel(v: number | null) {
  return v != null ? `对抗难度 ${v}` : '未设对抗难度';
}

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

function filtered(): Enemy[] {
  const q = query.trim().toLowerCase();
  let out = enemies.filter(e =>
    (tier === 0 || e.tier === tier) &&
    (type === '' || e.type === type) &&
    (q === '' || (SEARCH.get(e.id) || '').includes(q)),
  );
  out = [...out].sort((a, b) => {
    if (sort === 'difficulty') return a.difficulty - b.difficulty || a.tier - b.tier || a.name.localeCompare(b.name, 'zh');
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh');
    return a.tier - b.tier || a.difficulty - b.difficulty || a.name.localeCompare(b.name, 'zh');
  });
  return out;
}

function setSharedDifficulty(n: number) {
  setDifficulty(n);
  sharedDiff = n;
  const label = document.querySelector('.be-diff');
  if (label) label.textContent = diffLabel(n);
  toast(`已同步给全场 · 对抗难度 ${n}`);
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

// ---------- rendering ----------
function header() {
  return el('div', { class: 'be-header' },
    el('div', { class: 'be-title-row' },
      el('div', { class: 'be-title' }, '📖 怪物图鉴'),
      el('span', { class: 'be-role' }, role === 'GM' ? 'GM 专用' : '玩家'),
      el('div', { class: 'be-spacer' }),
      el('span', { class: 'be-diff' }, diffLabel(sharedDiff)),
    ),
    el('div', { class: 'be-sub' }, `《核心规则书》 ${enemies.length} 条敌人 · 内置离线数据`),
    el('div', { class: 'be-tabs' },
      el('button', { class: 'be-tab' + (tab === 'book' ? ' active' : ''), onclick: () => { tab = 'book'; render(); } }, '图鉴'),
      el('button', { class: 'be-tab' + (tab === 'encounter' ? ' active' : ''), onclick: () => { tab = 'encounter'; render(); } },
        `遭遇 ${units.length ? `(${units.length})` : ''}`),
    ),
  );
}

function toolbar() {
  const search = el('input', {
    class: 'be-search', type: 'search', placeholder: '搜索名称 / 原文 / 特性 / 描述…', value: query,
    oninput: (e: Event) => {
      query = (e.target as HTMLInputElement).value;
      renderListOnly();
    },
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

  return el('div', { class: 'be-toolbar' },
    search,
    tierBar,
    el('div', { class: 'be-select-row' }, typeSel, sortSel, el('span', { class: 'be-count' }, '')),
  );
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
      el('span', {}, e.type),
      el('span', { class: 'be-dot' }, '·'),
      el('span', {}, `HP ${e.hp}`),
      el('span', { class: 'be-dot' }, '·'),
      el('span', {}, `压力 ${e.stress}`),
    ),
    el('div', { class: 'be-item-en' }, e.original),
  );
}

function listPane(): HTMLElement {
  const list = el('div', { class: 'be-list', id: 'be-list' });
  return list;
}
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
    el('div', { class: 'be-stat-value' }, value),
  );
}

function detailPane(): HTMLElement {
  const pane = el('div', { class: 'be-detail' });
  const e = enemies.find(x => x.id === selected);
  if (!e) {
    pane.append(el('div', { class: 'be-placeholder' },
      el('div', { class: 'be-ph-icon' }, '📖'),
      el('div', { class: 'be-ph-title' }, '从左侧选一个敌人'),
      el('div', { class: 'be-ph-text' }, '可以看到它的难度、阈值、攻击、经历与全部特性。点「设为对抗难度」会把数值实时推给全场玩家的骰子面板。'),
    ));
    return pane;
  }

  const head = el('div', { class: 'be-d-head' },
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
  );
  pane.append(head);

  const th = e.thresholds || [];
  pane.append(el('div', { class: 'be-stats' },
    stat('难度', String(e.difficulty), 'accent'),
    stat('阈值', th[0] == null && th[1] == null ? '无' : `${th[0] ?? '无'} / ${th[1] ?? '无'}`),
    stat('生命点', String(e.hp), 'hp'),
    stat('压力点', String(e.stress), 'stress'),
  ));

  if (e.attack) {
    pane.append(el('div', { class: 'be-attack' },
      el('div', { class: 'be-sec-title' }, '⚔ 攻击'),
      el('div', { class: 'be-attack-row' },
        el('div', { class: 'be-attack-main' },
          el('b', {}, e.attack.weapon || '普通攻击'),
          el('span', { class: 'be-attack-range' }, e.attack.range),
        ),
        el('div', { class: 'be-attack-dmg' }, e.attack.damage || e.attack.line),
        el('div', { class: 'be-attack-bonus' }, e.attack.bonus ? `命中 ${e.attack.bonus}` : ''),
      ),
    ));
  }
  if (e.experiences) {
    pane.append(el('div', { class: 'be-exp' }, el('b', {}, '经历：'), e.experiences));
  }

  if (e.features.length) {
    const box = el('div', { class: 'be-features' });
    box.append(el('div', { class: 'be-sec-title' }, `✦ 特性 · ${e.features.length}`));
    for (const f of e.features) {
      const tag = featureLabel(f.name);
      box.append(el('div', { class: 'be-feature' },
        el('div', { class: 'be-feature-name' },
          cleanFeatureName(f.name),
          tag ? el('span', { class: `be-ftag ${tag.cls}` }, tag.text) : null,
        ),
        f.desc ? el('div', { class: 'be-feature-desc' }, f.desc) : null,
      ));
    }
    pane.append(box);
  }

  pane.append(el('div', { class: 'be-actions' },
    el('button', { class: 'be-btn primary', onclick: () => setSharedDifficulty(e.difficulty) },
      '🎯 设为对抗难度'),
    el('button', { class: 'be-btn', onclick: () => addUnit(e) }, '＋ 加入遭遇'),
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
        el('button', { class: 'be-link', onclick: () => setSharedDifficulty(u.difficulty) }, '设为对抗难度'),
        el('button', { class: 'be-link', onclick: () => { selected = u.id; tab = 'book'; render(); } }, '查看图鉴'),
      ),
    ));
  }
  return pane;
}

function render() {
  const root = document.getElementById('bestiary');
  if (!root) return;
  clear(root);
  const body = el('div', { class: 'be-body' });
  if (tab === 'book') {
    const list = listPane();
    body.append(list, detailPane());
    root.append(header(), toolbar(), body);
    renderListInto(list);
  } else {
    root.append(header(), body);
    body.append(encounterPane());
  }
}

function denied() {
  const root = document.getElementById('bestiary')!;
  clear(root);
  root.append(el('div', { class: 'be-denied' },
    el('div', { class: 'be-denied-icon' }, '🔒'),
    el('div', { class: 'be-denied-title' }, '仅 GM 可用'),
    el('div', { class: 'be-denied-text' }, '怪物图鉴包含敌人的数值、特性与动机战术。Owlbear 的扩展图标对所有人可见，但玩家端不会加载任何敌人数据。'),
  ));
}

async function detectRole(): Promise<Role> {
  const override = new URLSearchParams(location.search).get('role');
  if (override === 'gm' || override === 'player') return override === 'gm' ? 'GM' : 'PLAYER';
  if (!OBR.isAvailable) return 'GM'; // plain-browser preview
  try {
    await Promise.race([
      new Promise<void>(res => OBR.onReady(() => res())),
      new Promise<void>(res => setTimeout(res, 3000)),
    ]);
    return await OBR.player.getRole();
  } catch {
    return 'GM';
  }
}

async function boot() {
  role = await detectRole();
  if (role !== 'GM') { denied(); return; }
  startDifficulty('GM');
  onDifficulty((v) => {
    sharedDiff = v;
    const label = document.querySelector('.be-diff');
    if (label) label.textContent = diffLabel(v);
  });
  render();
}

boot();
