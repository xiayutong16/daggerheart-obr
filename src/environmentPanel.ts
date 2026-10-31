import { el, clear } from './dom';
import { ENVIRONMENTS } from './data/environments';
import type { Environment } from './types';

export function renderEnvironmentPanel(root: HTMLElement) {
  clear(root);

  const types = Array.from(new Set(ENVIRONMENTS.map((e) => e.typeZh))).sort();
  const search = el('input', { class: 'input', type: 'text', placeholder: '搜索环境名称…' }) as HTMLInputElement;
  const typeSel = el('select', { class: 'input' }) as HTMLSelectElement;
  typeSel.append(el('option', { value: '' }, '全部类型'));
  for (const t of types) typeSel.append(el('option', { value: t }, t));

  const listEl = el('div', { class: 'env-list' });

  function render() {
    const q = search.value.trim().toLowerCase();
    const ft = typeSel.value;
    const filtered = ENVIRONMENTS.filter((e) => {
      if (ft && e.typeZh !== ft) return false;
      if (q && !(e.nameZh.toLowerCase().includes(q) || e.nameEn.toLowerCase().includes(q))) return false;
      return true;
    });
    clear(listEl);
    if (!filtered.length) listEl.append(el('div', { class: 'empty' }, '没有匹配的环境。'));
    for (const e of filtered) listEl.append(envCard(e));
  }

  search.addEventListener('input', render);
  typeSel.addEventListener('change', render);
  root.append(
    el('p', { class: 'hint' }, '领土 / 环境图鉴：为 GM 提供场景特性与引导问题。'),
    el('div', { class: 'filter-bar' }, search),
    el('div', { class: 'filter-bar' }, typeSel),
    listEl,
  );
  render();
}

function envCard(e: Environment) {
  const card = el('div', { class: 'env-card' });
  card.append(
    el('div', { class: 'env-head' },
      el('div', { class: 'env-name' },
        el('span', { class: 'env-zh' }, e.nameZh),
        el('span', { class: 'env-en' }, e.nameEn),
      ),
      el('div', { class: 'env-tags' },
        el('span', { class: 'tag tier' }, `T${e.tier}`),
        el('span', { class: 'tag type' }, e.typeZh),
      ),
    ),
  );
  if (e.impulses) card.append(el('div', { class: 'env-impulse' }, '趋向：' + e.impulses));
  if (e.potentialAdversaries && e.potentialAdversaries.length) {
    card.append(el('div', { class: 'detail-line' }, el('b', {}, '潜在敌人：'), e.potentialAdversaries.join('，')));
  }
  if (e.features && e.features.length) {
    card.append(el('div', { class: 'detail-sub' }, '特性'));
    for (const f of e.features) card.append(el('div', { class: 'detail-line' }, el('b', {}, `${f.name}（${f.kind}）：`), ' ' + f.text));
  }
  if (e.gmPrompts && e.gmPrompts.length) {
    card.append(el('div', { class: 'detail-sub' }, 'GM 引导问题'));
    const ul = el('ul', { class: 'prompt-list' });
    for (const p of e.gmPrompts) ul.append(el('li', {}, p));
    card.append(ul);
  }
  return card;
}
