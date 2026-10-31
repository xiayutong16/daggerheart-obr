import { el, clear } from './dom';
import type { CharData } from './types';
import { TRAITS, CLASSES, ANCESTRIES, COMMUNITIES, DOMAINS } from './data/classes';
import { appState } from './state';

const KEY = 'dh_char_v1';

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
    armor: 0,
    proficiency: 1,
    hope: 0,
    fear: 0,
    thresholds: '8 / 16',
    experiences: [],
    domainCards: [],
  };
}

function load(): CharData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as CharData;
      // ensure traits exist
      for (const t of TRAITS) if (d.traits[t.zh] == null) d.traits[t.zh] = 0;
      return d;
    }
  } catch {}
  return defaultChar();
}

function save(d: CharData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}

export function renderCharacterPanel(root: HTMLElement) {
  clear(root);
  const data = load();

  const header = el('div', { class: 'char-head' },
    el('div', { class: 'char-title' }, '角色卡'),
    el('button', { class: 'btn ghost', onclick: () => { save(data); flash(saved, '已保存'); } }, '💾 保存'),
  );
  const saved = el('span', { class: 'saved-flash' }, '');

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
  resources.append(
    tracker('生命 HP', () => data.hp, (v) => { data.hp = v; save(data); }, () => data.hpMax, (v) => { data.hpMax = v; save(data); }),
    tracker('压力 Stress', () => data.stress, (v) => { data.stress = v; save(data); }, () => data.stressMax, (v) => { data.stressMax = v; save(data); }),
    tracker('希望 Hope', () => data.hope, (v) => { data.hope = v; save(data); }),
    tracker('恐惧 Fear (GM)', () => data.fear, (v) => { data.fear = v; save(data); }),
  );
  const statsRow = el('div', { class: 'stat-row' },
    smallField('闪避 Evasion', data.evasion, (v) => { data.evasion = v; save(data); }),
    smallField('护甲 Armor', data.armor, (v) => { data.armor = v; save(data); }),
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
    renderCharacterPanel(root);
  }

  root.append(header, saved, identity, traitsCard, resources, listCard);
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
  const plus = el('button', { class: 'step', onclick: () => { set(get() + 1); refresh(); } }, '+');
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
