import { el, clear } from './dom';
import { MONSTERS } from './data/monsters';
import type { Monster } from './types';

export function renderBestiaryPanel(root: HTMLElement) {
  clear(root);

  const types = Array.from(new Set(MONSTERS.map((m) => m.typeZh))).sort();
  const tiers = Array.from(new Set(MONSTERS.map((m) => m.tier))).sort((a, b) => a - b);

  const search = el('input', { class: 'input', type: 'text', placeholder: '搜索怪物名称…' }) as HTMLInputElement;
  const tierSel = el('select', { class: 'input' }) as HTMLSelectElement;
  tierSel.append(el('option', { value: '' }, '全部位阶'));
  for (const t of tiers) tierSel.append(el('option', { value: String(t) }, `T${t}`));
  const typeSel = el('select', { class: 'input' }) as HTMLSelectElement;
  typeSel.append(el('option', { value: '' }, '全部种类'));
  for (const t of types) typeSel.append(el('option', { value: t }, t));

  const countEl = el('div', { class: 'list-count' }, '');
  const listEl = el('div', { class: 'bestiary-list' });

  function render() {
    const q = search.value.trim().toLowerCase();
    const ft = tierSel.value;
    const fty = typeSel.value;
    const filtered = MONSTERS.filter((m) => {
      if (ft && m.tier !== Number(ft)) return false;
      if (fty && m.typeZh !== fty) return false;
      if (q && !(m.nameZh.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q))) return false;
      return true;
    });
    countEl.textContent = `共 ${filtered.length} 个敌人`;
    clear(listEl);
    if (!filtered.length) listEl.append(el('div', { class: 'empty' }, '没有匹配的敌人。'));
    for (const m of filtered) listEl.append(monsterCard(m));
  }

  search.addEventListener('input', render);
  tierSel.addEventListener('change', render);
  typeSel.addEventListener('change', render);

  root.append(
    el('div', { class: 'filter-bar' }, search),
    el('div', { class: 'filter-bar' }, tierSel, typeSel, countEl),
    listEl,
  );
  render();
}

function monsterCard(m: Monster) {
  const card = el('div', { class: 'mon-card' });
  const head = el('div', { class: 'mon-head' },
    el('div', { class: 'mon-name' },
      el('span', { class: 'mon-zh' }, m.nameZh),
      el('span', { class: 'mon-en' }, m.nameEn),
    ),
    el('div', { class: 'mon-tags' },
      el('span', { class: 'tag tier' }, `T${m.tier}`),
      el('span', { class: 'tag type' }, m.typeZh),
    ),
  );
  const stats = el('div', { class: 'mon-stats' },
    stat('难度', m.difficulty),
    stat('HP', m.hp),
    stat('压力', m.stress),
  );
  card.append(head, stats);

  const hasDetail = !!(m.thresholds || (m.attacks && m.attacks.length) || (m.features && m.features.length) || (m.experiences && m.experiences.length));
  if (hasDetail) {
    const detail = el('div', { class: 'mon-detail hidden' });
    card.append(el('button', { class: 'btn small ghost', onclick: (e: Event) => {
      detail.classList.toggle('hidden');
      (e.target as HTMLElement).textContent = detail.classList.contains('hidden') ? '展开详情 ▾' : '收起 ▴';
    } }, '展开详情 ▾'));
    if (m.thresholds) detail.append(el('div', { class: 'detail-line' }, el('b', {}, '阈值：'), m.thresholds));
    if (m.experiences && m.experiences.length) detail.append(el('div', { class: 'detail-line' }, el('b', {}, '经历：'), m.experiences.join('，')));
    if (m.attacks && m.attacks.length) {
      detail.append(el('div', { class: 'detail-sub' }, '攻击'));
      for (const a of m.attacks) detail.append(el('div', { class: 'detail-line' }, `${a.name} — ${a.atk}（${a.range}）${a.damage ? ' · ' + a.damage : ''}`));
    }
    if (m.features && m.features.length) {
      detail.append(el('div', { class: 'detail-sub' }, '特性'));
      for (const f of m.features) detail.append(el('div', { class: 'detail-line' }, el('b', {}, `${f.name}（${f.kind}）：`), ' ' + f.text));
    }
    card.append(detail);
  }
  return card;
}

function stat(label: string, value: number | string) {
  return el('div', { class: 'stat' }, el('span', { class: 'stat-val' }, String(value)), el('span', { class: 'stat-label' }, label));
}
