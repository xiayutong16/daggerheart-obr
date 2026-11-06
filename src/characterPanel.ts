import { el, clear } from './dom';
import type { CharData, Role } from './types';
import { TRAITS, CLASSES, ANCESTRIES, COMMUNITIES, DOMAINS } from './data/classes';
import { appState } from './state';
import { normalizeChar, decodeCharCode } from './charSync';

const KEY = 'dh_char_v1';

/**
 * A sheet arrived from the character-card workshop. Set the session copy as
 * well as storage, so this works even when the Owlbear iframe silently blocks
 * localStorage (a known platform quirk).
 */
export function applySyncedChar(raw: CharData): void {
  memChar = normalizeChar(raw) ?? defaultChar();
  save(memChar);
}

/** Result of the last damage resolution — kept module-level so a re-render still shows it. */
let lastDamage: { text: string; tone: 'ok' | 'warn' | 'bad' } | null = null;

/** "8 / 16" → { major: 8, severe: 16 } */
function parseThresholds(s: string): { major: number; severe: number } {
  const nums = (s.match(/\d+/g) || []).map((n) => parseInt(n, 10));
  const major = nums[0] ?? 8;
  const severe = Math.max(nums[1] ?? major * 2, major);
  return { major, severe };
}

function severityOf(dmg: number, major: number, severe: number): { label: string; marks: number } {
  if (dmg < major) return { label: '轻伤', marks: 1 };
  if (dmg < severe) return { label: '重伤', marks: 2 };
  return { label: '严重', marks: 3 };
}

function defaultChar(): CharData {
  const traits: Record<string, number> = {};
  for (const t of TRAITS) traits[t.zh] = 0;
  return {
    name: appState.playerName || '',
    ancestry: '',
    community: '',
    classZh: CLASSES[0].zh,
    subclass: '',
    traits,
    hp: 5, hpMax: 5,
    stress: 0, stressMax: 6,
    evasion: 10,
    armor: 3,
    armorMax: 3,
    proficiency: 1,
    hope: 0,
    fear: 0,
    thresholds: '8 / 16',
    experiences: [],
    domainCards: [],
  };
}

/**
 * Session copy of the sheet. If the browser refuses localStorage (sandboxed
 * iframe, blocked third-party storage) this keeps Hope / Fear / HP alive for as
 * long as the panel is open instead of silently resetting on every read.
 */
let memChar: CharData | null = null;
let storageOff = false;

function load(): CharData {
  if (storageOff) return (memChar ??= defaultChar());
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as CharData;
      // ensure traits exist
      for (const t of TRAITS) if (d.traits[t.zh] == null) d.traits[t.zh] = 0;
      // older saves had no armor max — start from the armour score we have
      if (typeof d.armorMax !== 'number') d.armorMax = Math.max(3, d.armor || 0);
      if (typeof d.armor !== 'number') d.armor = d.armorMax;
      // Old saves may hold more Fear than the rules allow (cap is 12).
      if (typeof d.fear !== 'number' || d.fear > 12) d.fear = Math.min(12, d.fear || 0);
      memChar = d;
      return d;
    }
  } catch {
    storageOff = true;
    return (memChar ??= defaultChar());
  }
  // Nothing saved yet — reuse the session copy so unsaved edits aren't lost.
  return (memChar ??= defaultChar());
}

function save(d: CharData) {
  memChar = d;
  if (storageOff) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    storageOff = true;
  }
}

export function renderCharacterPanel(root: HTMLElement, role: Role = 'GM') {
  clear(root);
  const data = load();

  const header = el('div', { class: 'char-head' },
    el('div', { class: 'char-title' }, '角色卡'),
    el('button', { class: 'btn ghost', onclick: () => { save(data); flash(saved, '已保存'); } }, '💾 保存'),
  );
  const saved = el('span', { class: 'saved-flash' }, '');

  // ---- optional import fallback (the only workshop entry is the "建立角色卡"
  //      button in the standalone character page header) ----
  const codeInput = el('input', {
    class: 'input', type: 'text', placeholder: '粘贴 DH1: 开头的车卡导入码…',
  }) as HTMLInputElement;
  const syncCard = el('details', { class: 'card char-sync' },
    el('summary', { class: 'card-title' }, '从车卡工坊导入（可选）'),
    el('div', { class: 'hint' },
      '做好角色卡后点「同步到枭雄」会自动更新这里；若浏览器拦截本地存储，就复制导入码粘贴到下面。'),
    el('div', { class: 'char-sync-row' }, codeInput,
      el('button', {
        class: 'btn small',
        onclick: () => {
          const d = decodeCharCode(codeInput.value);
          if (!d) { flash(saved, '导入码无效，需以 DH1: 开头'); return; }
          applySyncedChar(d);
          flash(saved, '已从车卡工坊导入');
          codeInput.value = '';
          renderAll();
        },
      }, '📥 导入'),
    ),
  );

  // ---- identity ----
  const nameInput = textInput(data.name, (v) => { data.name = v; save(data); });
  const ancestrySel = selectInput(ANCESTRIES, data.ancestry, (v) => { data.ancestry = v; save(data); });
  const communitySel = selectInput(COMMUNITIES, data.community, (v) => { data.community = v; save(data); });
  const classSel = selectInput(CLASSES.map((c) => `${c.zh} ${c.en}`), `${data.classZh} ${CLASSES.find((c) => c.zh === data.classZh)?.en || ''}`, (v) => {
    const found = CLASSES.find((c) => `${c.zh} ${c.en}` === v);
    if (found) {
      data.classZh = found.zh;
      data.hpMax = found.hp; data.hp = found.hp;
      data.stressMax = found.stress; data.stress = 0;
      data.evasion = found.evasion;
      save(data); renderAll();
    }
  });
  const subclassInput = textInput(data.subclass, (v) => { data.subclass = v; save(data); });

  const identity = el('div', { class: 'card' },
    field('姓名', nameInput),
    field('种族 Ancestry', ancestrySel),
    field('社群 Community', communitySel),
    field('职业 Class', classSel),
    field('子职 Subclass', subclassInput),
  );

  // ---- traits ----
  const traitsCard = el('div', { class: 'card' }, el('div', { class: 'card-title' }, '属性 Traits'));
  const traitGrid = el('div', { class: 'trait-grid' });
  for (const t of TRAITS) {
    const inp = el('input', { class: 'input trait-input', type: 'number', value: String(data.traits[t.zh]), step: '1' }) as HTMLInputElement;
    inp.addEventListener('input', () => { data.traits[t.zh] = parseInt(inp.value || '0', 10) || 0; save(data); });
    traitGrid.append(el('div', { class: 'trait-cell' }, el('div', { class: 'trait-name' }, `${t.zh}`), el('div', { class: 'trait-en' }, t.en), inp));
  }
  traitsCard.append(traitGrid);

  // ---- resources ----
  const resources = el('div', { class: 'card' }, el('div', { class: 'card-title' }, '资源 Resources'));
  const trackers = [
    tracker('生命 HP', () => data.hp, (v) => { data.hp = v; save(data); }, () => data.hpMax, (v) => { data.hpMax = v; save(data); }),
    tracker('压力 Stress', () => data.stress, (v) => { data.stress = v; save(data); }, () => data.stressMax, (v) => { data.stressMax = v; save(data); }),
    tracker('护甲 Armor', () => data.armor, (v) => { data.armor = v; save(data); }, () => data.armorMax, (v) => { data.armorMax = v; save(data); }),
    tracker('希望 Hope', () => data.hope, (v) => { data.hope = v; save(data); }),
  ];
  if (role === 'GM') {
    // SRD: the GM's Fear pool is capped at 12 and carries over between sessions.
    trackers.push(tracker('恐惧 Fear (GM)', () => data.fear, (v) => { data.fear = v; save(data); }, () => 12));
  }
  resources.append(...trackers);
  const statsRow = el('div', { class: 'stat-row' },
    smallField('闪避 Evasion', data.evasion, (v) => { data.evasion = v; save(data); }),
    smallField('熟练 Prof.', data.proficiency, (v) => { data.proficiency = v; save(data); }),
    smallField('阈值 重伤/严重', data.thresholds, (v) => { data.thresholds = v; save(data); }, true),
  );
  resources.append(statsRow);

  // ---- experiences & domain cards ----
  const listCard = el('div', { class: 'card' },
    el('div', { class: 'card-title' }, '经历 Experiences'),
    editableList(data.experiences, (list) => { data.experiences = list; save(data); }, '添加一段经历…'),
    el('div', { class: 'card-title' }, '领域卡 Domain Cards'),
    editableList(data.domainCards, (list) => { data.domainCards = list; save(data); }, '添加一张领域卡…'),
  );

  function renderAll() {
    // Keep the same role on re-render — otherwise a damage resolution would flip
    // the panel into the GM view (and expose the GM Fear tracker).
    renderCharacterPanel(root, role);
  }

  root.append(header, saved, syncCard, identity, traitsCard, resources, damageCard(data, renderAll), listCard);
}

/** Automatic damage resolution against the character's damage thresholds. */
function damageCard(data: CharData, refresh: () => void) {
  const { major, severe } = parseThresholds(data.thresholds);

  const input = el('input', { class: 'input', type: 'number', placeholder: '输入受到的伤害值' }) as HTMLInputElement;
  const armorChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  armorChk.disabled = data.armor <= 0;
  const preview = el('div', { class: 'dmg-preview' }, '');
  const result = el('div', { class: 'dmg-result' + (lastDamage ? ' ' + lastDamage.tone : '') }, lastDamage?.text ?? '');

  function calc() {
    const dmg = parseInt(input.value || '', 10);
    if (!Number.isFinite(dmg) || dmg <= 0) return null;
    const sev = severityOf(dmg, major, severe);
    const armorUsed = armorChk.checked && data.armor > 0;
    const marks = Math.max(0, sev.marks - (armorUsed ? 1 : 0));
    return { dmg, label: sev.label, marks, armorUsed };
  }

  function updatePreview() {
    const c = calc();
    if (!c) {
      preview.textContent = `阈值：轻伤 < ${major} · 重伤 ${major}–${severe - 1} · 严重 ≥ ${severe}`;
      preview.className = 'dmg-preview';
      return;
    }
    preview.textContent =
      `${c.dmg} 点 → ${c.label} · 标记 ${c.marks} 生命` +
      (c.armorUsed ? `（护甲抵消 1 档，将剩 ${data.armor - 1} 槽）` : '');
    preview.className = 'dmg-preview active';
  }
  input.addEventListener('input', updatePreview);
  armorChk.addEventListener('change', updatePreview);

  const apply = el('button', {
    class: 'btn primary',
    onclick: () => {
      const c = calc();
      if (!c) return;
      if (c.armorUsed) data.armor = Math.max(0, data.armor - 1);
      data.hp = Math.max(0, data.hp - c.marks);
      save(data);
      const down = data.hp === 0;
      lastDamage = {
        text:
          `${c.dmg} 点伤害 → ${c.label} · 标记 ${c.marks} 生命` +
          (c.armorUsed ? `（消耗 1 护甲槽，剩 ${data.armor}）` : '') +
          ` → 生命 ${data.hp}/${data.hpMax}` +
          (down ? ' ⚠️ 生命归零，需进行死亡动作' : ''),
        tone: down ? 'bad' : c.label === '轻伤' ? 'ok' : c.label === '重伤' ? 'warn' : 'bad',
      };
      refresh();
    },
  }, '结算伤害');

  updatePreview();

  return el('div', { class: 'card dmg-card' },
    el('div', { class: 'card-title' }, '伤害结算 Damage'),
    el('div', { class: 'hint' }, '按匕首之心阈值自动判定：低于重伤线记 1 点，介于两线之间记 2 点，达到严重线记 3 点。勾选护甲槽可抵消一档。'),
    el('div', { class: 'dmg-row' }, input, apply),
    el('label', { class: 'check' }, armorChk, el('span', {}, `使用护甲槽（剩 ${data.armor}/${data.armorMax}）`)),
    preview,
    result,
  );
}

// ---- components ----

function textInput(value: string, onChange: (v: string) => void) {
  const i = el('input', { class: 'input', type: 'text', value }) as HTMLInputElement;
  i.addEventListener('input', () => onChange(i.value));
  return i;
}

function selectInput(options: string[], value: string, onChange: (v: string) => void) {
  const s = el('select', { class: 'input' }) as HTMLSelectElement;
  for (const o of options) {
    const opt = el('option', { value: o }, o) as HTMLOptionElement;
    if (o === value) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function field(label: string, control: HTMLElement) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}

function tracker(
  label: string,
  get: () => number,
  set: (v: number) => void,
  getMax?: () => number,
  setMax?: (v: number) => void,
) {
  const valEl = el('span', { class: 'track-val' }, `${get()}`);
  const maxEl = el('span', { class: 'track-max' }, getMax ? `/ ${getMax()}` : '');
  function refresh() { valEl.textContent = String(get()); if (getMax) maxEl.textContent = `/ ${getMax()}`; }
  const minus = el('button', { class: 'step', onclick: () => { set(Math.max(0, get() - 1)); refresh(); } }, '−');
  const plus = el('button', { class: 'step', onclick: () => { set(Math.min(get() + 1, getMax ? getMax() : Number.MAX_SAFE_INTEGER)); refresh(); } }, '+');
  const controls = [minus, valEl] as (Node)[];
  if (getMax) controls.push(maxEl);
  controls.push(plus);
  const row = el('div', { class: 'tracker' },
    el('span', { class: 'track-label' }, label),
    el('div', { class: 'track-control' }, ...controls),
  );
  if (setMax && getMax) {
    const maxMinus = el('button', { class: 'step small', onclick: () => { setMax(Math.max(1, getMax() - 1)); refresh(); } }, '−max');
    const maxPlus = el('button', { class: 'step small', onclick: () => { setMax(getMax() + 1); refresh(); } }, '+max');
    row.append(el('div', { class: 'track-maxctrl' }, maxMinus, maxPlus));
  }
  return row;
}

function smallField(label: string, value: number | string, onChange: (v: any) => void, isText = false) {
  const i = isText
    ? el('input', { class: 'input', type: 'text', value: String(value) }) as HTMLInputElement
    : el('input', { class: 'input', type: 'number', value: String(value) }) as HTMLInputElement;
  i.addEventListener('input', () => onChange(isText ? i.value : (parseInt(i.value || '0', 10) || 0)));
  return el('label', { class: 'small-field' }, el('span', { class: 'field-label' }, label), i);
}

function editableList(items: string[], onChange: (items: string[]) => void, placeholder: string) {
  const wrap = el('div', { class: 'edlist' });
  const input = el('input', { class: 'input', type: 'text', placeholder }) as HTMLInputElement;
  const add = el('button', { class: 'btn small', onclick: () => {
    if (input.value.trim()) { items.push(input.value.trim()); input.value = ''; onChange([...items]); renderItems(); }
  } }, '+ 添加');
  const listEl = el('div', { class: 'edlist-items' });
  function renderItems() {
    clear(listEl);
    items.forEach((it, idx) => {
      listEl.append(el('div', { class: 'editem' },
        el('span', {}, it),
        el('button', { class: 'x', onclick: () => { items.splice(idx, 1); onChange([...items]); renderItems(); } }, '×'),
      ));
    });
  }
  renderItems();
  wrap.append(el('div', { class: 'edlist-add' }, input, add), listEl);
  return wrap;
}

function flash(node: HTMLElement, msg: string) {
  node.textContent = msg;
  setTimeout(() => { node.textContent = ''; }, 1500);
}

// Let the dice panel read / write the same sheet (trait modifiers, etc.).
export { load as loadChar, save as saveChar };
