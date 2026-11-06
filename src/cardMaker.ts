// Daggerheart character-card workshop.
//
// A standalone page (also loadable as an Owlbear popover). Fill the form on the
// left, watch the printable card on the right, then push the sheet into the
// main Owlbear extension via charSync.ts. The data shape is exactly CharData,
// so the in-Owlbear character sheet, the dice panel's trait modifiers and the
// damage calculator all pick it up without any conversion.
import './cardMaker.css';
import { el, clear } from './dom';
import type { CharData } from './types';
import { TRAITS, CLASSES, ANCESTRIES, COMMUNITIES, DOMAINS } from './data/classes';
import {
  normalizeChar, readLocalChar, writeLocalChar, publishChar,
  encodeCharCode, decodeCharCode,
} from './charSync';

const CHAR_URL = 'https://xiayutong16.github.io/daggerheart-obr/char/index.html';
const DL_DOMAINS = 'cm-domain-options';

function defaultData(): CharData {
  const traits: Record<string, number> = {};
  for (const t of TRAITS) traits[t.zh] = 0;
  return {
    name: '', ancestry: '', community: '',
    classZh: CLASSES[0].zh, subclass: '', traits,
    hp: 5, hpMax: 5, stress: 0, stressMax: 6,
    evasion: 10, armor: 3, armorMax: 3, proficiency: 1,
    hope: 0, fear: 0, thresholds: '8 / 16',
    experiences: [], domainCards: [],
  };
}

function sampleData(): CharData {
  return {
    name: '艾莉亚·晨星',
    ancestry: '精灵 Elf',
    community: '学院 Academia',
    classZh: '游侠',
    subclass: '驯兽师',
    traits: { '敏捷': 2, '力量': 1, '伶俐': 1, '直觉': 0, '知识': 0, '威仪': -1 },
    hp: 6, hpMax: 6, stress: 0, stressMax: 5,
    evasion: 11, armor: 3, armorMax: 3, proficiency: 1,
    hope: 2, fear: 0, thresholds: '8 / 16',
    experiences: ['林间追踪 +2', '弓术心得 +2'],
    domainCards: ['骨之 · 追踪猎手', '优雅 · 迅捷步法'],
  };
}

let data: CharData = readLocalChar() ?? defaultData();
const root = document.getElementById('cardmaker')!;

function toast(msg: string, tone: 'ok' | 'warn' = 'ok') {
  document.querySelectorAll('.cm-toast').forEach(t => t.remove());
  const t = el('div', { class: `cm-toast ${tone}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- generic form controls ----------
function row(label: string, control: HTMLElement, hint?: string) {
  return el('label', { class: 'cm-row' },
    el('span', { class: 'cm-label' }, label),
    el('span', { class: 'cm-control' }, control, hint ? el('span', { class: 'cm-row-hint' }, hint) : null),
  );
}
function textRow(label: string, get: () => string, set: (v: string) => void, placeholder = '', listId?: string) {
  const i = el('input', {
    class: 'cm-input', type: 'text', value: get(), placeholder,
    ...(listId ? { list: listId } : {}),
  }) as HTMLInputElement;
  i.addEventListener('input', () => { set(i.value); update(); });
  return row(label, i);
}
function numRow(label: string, get: () => number, set: (v: number) => void, min = 0, max = 99) {
  const i = el('input', {
    class: 'cm-input num', type: 'number', value: String(get()), min: String(min), max: String(max),
  }) as HTMLInputElement;
  i.addEventListener('input', () => {
    const v = parseInt(i.value || '0', 10);
    set(Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min);
    update();
  });
  return row(label, i);
}
function selectRow(label: string, options: string[], get: () => string, set: (v: string) => void) {
  const s = el('select', { class: 'cm-input' }) as HTMLSelectElement;
  for (const o of options) {
    const opt = el('option', { value: o }, o) as HTMLOptionElement;
    if (o === get()) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener('change', () => { set(s.value); update(); });
  return row(label, s);
}
function section(title: string, ...children: HTMLElement[]) {
  return el('div', { class: 'cm-section' },
    el('div', { class: 'cm-section-title' }, title),
    el('div', { class: 'cm-section-body' }, ...children));
}
function btn(label: string, onclick: () => void, cls = '') {
  return el('button', { class: 'cm-btn ' + cls, type: 'button', onclick }, label);
}

// ---------- form ----------
const form = el('div', { class: 'cm-form' });
const preview = el('div', { class: 'cm-preview' });
const codeBox = el('textarea', {
  class: 'cm-code-box', rows: 3, spellcheck: 'false',
  placeholder: '点「生成」得到导入码；或把枭雄里复制的码粘到这里点「载入」。',
}) as HTMLTextAreaElement;

function renderForm() {
  clear(form);

  const classLabels = CLASSES.map(c => `${c.zh} ${c.en}`);
  const currentClassLabel = `${data.classZh} ${CLASSES.find(c => c.zh === data.classZh)?.en || ''}`.trim();

  const identity = section('身份 · Identity',
    textRow('姓名', () => data.name, v => { data.name = v; }, '例如 艾莉亚·晨星'),
    selectRow('血统 · Ancestry', ['—', ...ANCESTRIES], () => data.ancestry || '—', v => { data.ancestry = v === '—' ? '' : v; }),
    selectRow('社群 · Community', ['—', ...COMMUNITIES], () => data.community || '—', v => { data.community = v === '—' ? '' : v; }),
    el('label', { class: 'cm-row' },
      el('span', { class: 'cm-label' }, '职业 · Class'),
      el('span', { class: 'cm-control' },
        (() => {
          const s = el('select', { class: 'cm-input' }) as HTMLSelectElement;
          for (const c of CLASSES) {
            const label = `${c.zh} ${c.en}`;
            const o = el('option', { value: label }, `${label}　HP ${c.hp} / 压力 ${c.stress} / 闪避 ${c.evasion}`) as HTMLOptionElement;
            if (label === currentClassLabel) o.selected = true;
            s.append(o);
          }
          s.addEventListener('change', () => {
            const found = CLASSES.find(c => `${c.zh} ${c.en}` === s.value);
            if (!found) return;
            data.classZh = found.zh;
            data.hpMax = found.hp; data.hp = found.hp;
            data.stressMax = found.stress; data.stress = 0;
            data.evasion = found.evasion;
            update();
            toast(`已套用「${found.zh}」的 1 级基础数值`);
          });
          return s;
        })(),
        el('span', { class: 'cm-row-hint' }, '切换职业会自动带入 HP / 压力 / 闪避（1 级）'),
      ),
    ),
    textRow('子职 · Subclass', () => data.subclass, v => { data.subclass = v; }, '例如 驯兽师'),
  );

  const traitGrid = el('div', { class: 'cm-traits' });
  for (const t of TRAITS) {
    const i = el('input', {
      class: 'cm-input num trait', type: 'number', value: String(data.traits[t.zh] ?? 0), min: '-9', max: '20',
    }) as HTMLInputElement;
    i.addEventListener('input', () => {
      const v = parseInt(i.value || '0', 10);
      data.traits[t.zh] = Number.isFinite(v) ? Math.max(-9, Math.min(20, v)) : 0;
      update();
    });
    traitGrid.append(el('div', { class: 'cm-trait' },
      el('div', { class: 'cm-trait-zh' }, t.zh),
      el('div', { class: 'cm-trait-en' }, t.en),
      i,
    ));
  }
  const traits = section('属性 · Traits',
    traitGrid,
    el('div', { class: 'cm-inline-actions' },
      btn('🧮 按标准数组分配', () => {
        const values = [2, 1, 1, 0, 0, -1];
        TRAITS.forEach((t, idx) => { data.traits[t.zh] = values[idx]; });
        renderForm(); update();
        toast('已按 +2 / +1 / +1 / 0 / 0 / −1 分配，可再逐个调整');
      }),
      btn('↺ 全部归零', () => {
        for (const t of TRAITS) data.traits[t.zh] = 0;
        renderForm(); update();
      }),
    ),
  );

  const resources = section('资源 · Resources',
    el('div', { class: 'cm-pair' },
      numRow('生命 HP', () => data.hp, v => { data.hp = v; }),
      numRow('生命上限', () => data.hpMax, v => { data.hpMax = v; }, 1),
    ),
    el('div', { class: 'cm-pair' },
      numRow('压力 Stress', () => data.stress, v => { data.stress = v; }),
      numRow('压力上限', () => data.stressMax, v => { data.stressMax = v; }, 1),
    ),
    el('div', { class: 'cm-pair' },
      numRow('护甲槽 Armor', () => data.armor, v => { data.armor = v; }),
      numRow('护甲上限', () => data.armorMax, v => { data.armorMax = v; }, 1),
    ),
    el('div', { class: 'cm-pair' },
      numRow('闪避 · Evasion', () => data.evasion, v => { data.evasion = v; }, 0, 40),
      numRow('熟练 · Proficiency', () => data.proficiency, v => { data.proficiency = v; }, 0, 6),
    ),
    el('div', { class: 'cm-pair' },
      numRow('希望 · Hope', () => data.hope, v => { data.hope = v; }, 0, 6),
      textRow('阈值 重伤 / 严重', () => data.thresholds, v => { data.thresholds = v; }, '8 / 16'),
    ),
    numRow('恐惧 · Fear（GM 池，通常为 0）', () => data.fear, v => { data.fear = v; }, 0, 12),
  );

  const experiences = section('经历 · Experiences',
    listEditor(data.experiences, '添加一段经历，例如「林间追踪 +2」…', ''),
  );
  const domains = section('领域卡 · Domain Cards',
    listEditor(data.domainCards, '添加一张领域卡…', DL_DOMAINS),
    el('datalist', { id: DL_DOMAINS }, ...DOMAINS.map(d => el('option', { value: d }))),
  );

  form.append(identity, traits, resources, experiences, domains);
}

function listEditor(items: string[], placeholder: string, listId = '') {
  const wrap = el('div', { class: 'cm-list' });
  const input = el('input', {
    class: 'cm-input', type: 'text', placeholder,
    ...(listId ? { list: listId } : {}),
  }) as HTMLInputElement;
  const add = () => {
    const v = input.value.trim();
    if (!v) return;
    items.push(v);
    input.value = '';
    renderForm(); update();
  };
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); add(); }
  });
  wrap.append(el('div', { class: 'cm-list-add' }, input, btn('+ 添加', add, 'small')));
  const chips = el('div', { class: 'cm-chips' });
  items.forEach((it, idx) => {
    chips.append(el('span', { class: 'cm-chip' }, it,
      el('button', {
        class: 'cm-chip-x', type: 'button', title: '删除',
        onclick: () => { items.splice(idx, 1); renderForm(); update(); },
      }, '×')));
  });
  wrap.append(chips);
  return wrap;
}

// ---------- printable character card ----------
function signed(n: number): string { return n > 0 ? `+${n}` : String(n); }
function bar(label: string, cur: number, max: number, cls: string) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (cur / max) * 100)) : 0;
  return el('div', { class: 'dh-bar' },
    el('div', { class: 'dh-bar-head' }, el('span', {}, label), el('b', {}, `${cur} / ${max}`)),
    el('div', { class: 'dh-bar-track' }, el('div', { class: `dh-bar-fill ${cls}`, style: `width:${pct}%` })),
  );
}
function pips(n: number, max: number) {
  const box = el('div', { class: 'dh-pips' });
  for (let i = 0; i < max; i++) box.append(el('span', { class: 'dh-pip' + (i < n ? ' on' : '') }));
  return box;
}
function renderCard(): HTMLElement {
  const d = data;
  const cls = CLASSES.find(c => c.zh === d.classZh);
  const traitCells = TRAITS.map(t => el('div', { class: 'dh-trait' },
    el('div', { class: 'dh-trait-en' }, t.en.toUpperCase()),
    el('div', { class: 'dh-trait-val' }, signed(d.traits[t.zh] ?? 0)),
    el('div', { class: 'dh-trait-zh' }, t.zh),
  ));
  return el('div', { class: 'dh-card' },
    el('div', { class: 'dh-card-head' },
      el('div', { class: 'dh-crest' }, '🗡️'),
      el('div', { class: 'dh-id' },
        el('div', { class: 'dh-name' }, d.name || '未命名冒险者'),
        el('div', { class: 'dh-class' }, `${d.classZh} ${cls?.en || ''} · ${d.subclass || '未选择子职'}`),
      ),
      el('div', { class: 'dh-level' }, 'LV', el('b', {}, '1')),
    ),
    el('div', { class: 'dh-lineage' }, `${d.ancestry || '—'}　·　${d.community || '—'}`),
    el('div', { class: 'dh-traits' }, ...traitCells),
    el('div', { class: 'dh-bars' },
      bar('生命 HP', d.hp, d.hpMax, 'hp'),
      bar('压力 Stress', d.stress, d.stressMax, 'stress'),
      bar('护甲 Armor', d.armor, d.armorMax, 'armor'),
    ),
    el('div', { class: 'dh-stats' },
      el('div', { class: 'dh-stat' }, el('span', {}, '闪避'), el('b', {}, String(d.evasion))),
      el('div', { class: 'dh-stat' }, el('span', {}, '熟练'), el('b', {}, String(d.proficiency))),
      el('div', { class: 'dh-stat wide' }, el('span', {}, '伤害阈值'), el('b', {}, d.thresholds || '—')),
    ),
    el('div', { class: 'dh-hope' },
      el('span', { class: 'dh-hope-label' }, '希望 HOPE'),
      pips(d.hope, 6),
    ),
    el('div', { class: 'dh-cols' },
      el('div', { class: 'dh-col' },
        el('div', { class: 'dh-col-title' }, '经历 · Experiences'),
        d.experiences.length
          ? el('div', { class: 'dh-tags' }, ...d.experiences.map(x => el('span', { class: 'dh-tag exp' }, x)))
          : el('div', { class: 'dh-empty' }, '尚未填写经历'),
      ),
      el('div', { class: 'dh-col' },
        el('div', { class: 'dh-col-title' }, '领域卡 · Domain Cards'),
        d.domainCards.length
          ? el('div', { class: 'dh-tags' }, ...d.domainCards.map(x => el('span', { class: 'dh-tag card' }, x)))
          : el('div', { class: 'dh-empty' }, '尚未选择领域卡'),
      ),
    ),
    el('div', { class: 'dh-foot' }, 'DAGGERHEART · SRD 1.0', el('span', {}, '匕首之心 · 车卡工坊')),
  );
}

function renderPreview() {
  clear(preview);
  preview.append(renderCard());
}

/** Every edit: persist locally and refresh the preview (never rebuild the form,
 *  so typing never loses focus). */
function update() {
  // Never replace `data` here: the list editors keep references to its arrays.
  // Imports / sample loads normalise first and then rebuild the whole form.
  writeLocalChar(data);
  renderPreview();
}

// ---------- import / export ----------
function downloadJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${data.name || 'daggerheart'}-角色卡.json` }) as HTMLAnchorElement;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('已导出 JSON 角色卡');
}
function importJsonFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = normalizeChar(JSON.parse(String(reader.result)));
      if (!parsed) { toast('这个文件不是有效的角色卡', 'warn'); return; }
      data = parsed;
      renderForm(); update();
      toast('已导入 JSON 角色卡');
    } catch { toast('JSON 解析失败', 'warn'); }
  };
  reader.readAsText(file);
}
function syncToOwlbear() {
  const d = normalizeChar(data);
  if (!d) { toast('角色卡数据无效', 'warn'); return; }
  const r = publishChar(d);
  toast(r.stored
    ? '已同步到枭雄：同一浏览器里的「我的角色卡」会立刻更新'
    : '本地存储被浏览器拦截，请改用下面的导入码', r.stored ? 'ok' : 'warn');
}
function copyCode() {
  if (!codeBox.value.trim()) codeBox.value = encodeCharCode(data);
  const text = codeBox.value.trim();
  navigator.clipboard?.writeText(text).then(
    () => toast('导入码已复制'),
    () => { codeBox.select(); toast('已选中，请按 Ctrl+C 复制', 'warn'); },
  );
  if (!navigator.clipboard) { codeBox.select(); toast('已选中，请按 Ctrl+C 复制', 'warn'); }
}

// ---------- shell ----------
function buildShell() {
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'cm-hidden' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) importJsonFile(f);
    fileInput.value = '';
  });

  const toolbar = el('div', { class: 'cm-toolbar' },
    el('div', { class: 'cm-brand' },
      el('div', { class: 'cm-brand-title' }, '🗡️ 匕首之心 · 车卡工坊'),
      el('div', { class: 'cm-brand-sub' }, '填表即时生成角色卡 · 一键同步到枭雄'),
    ),
    el('div', { class: 'cm-tools' },
      btn('🎲 示例角色', () => { data = sampleData(); renderForm(); update(); toast('已载入示例角色'); }),
      btn('📄 导出 JSON', downloadJson),
      btn('📥 导入 JSON', () => fileInput.click()),
      btn('📤 同步到枭雄', syncToOwlbear, 'primary'),
      btn('🖨 打印 / 存 PDF', () => window.print()),
      fileInput,
    ),
  );

  const codeArea = el('div', { class: 'cm-code' },
    el('div', { class: 'cm-code-title' }, '🔗 导入码 · 跨设备或浏览器拦截本地存储时用它'),
    el('div', { class: 'cm-code-row' }, codeBox,
      el('div', { class: 'cm-code-btns' },
        btn('生成', () => { codeBox.value = encodeCharCode(data); toast('已生成导入码'); }),
        btn('复制', copyCode),
        btn('载入', () => {
          const d = decodeCharCode(codeBox.value);
          if (!d) { toast('导入码无效或不是 DH1: 开头', 'warn'); return; }
          data = d; renderForm(); update(); toast('已从导入码载入角色卡');
        }),
        btn('读取枭雄角色卡', () => {
          const d = readLocalChar();
          if (!d) { toast('本机还没有枭雄角色卡数据', 'warn'); return; }
          data = d; renderForm(); update(); toast('已读取本机角色卡');
        }),
      ),
    ),
    el('div', { class: 'cm-code-hint' },
      '在枭雄右侧工具栏打开「我的角色卡」页面，展开「从车卡工坊导入」粘贴这段码即可；也可直接点上面的「同步到枭雄」。',
      el('a', { href: CHAR_URL, target: '_blank', rel: 'noopener' }, '↗ 打开角色卡页面'),
    ),
  );

  root.append(toolbar, el('div', { class: 'cm-body' }, form, preview), codeArea);
}

buildShell();
renderForm();
update();
