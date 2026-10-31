import { el, clear } from './dom';
import { rollDuality, rollPolyhedral, OUTCOME_LABEL, OUTCOME_DESC } from './dice';
import { TRAITS } from './data/classes';
import type { DualityResult } from './types';

export function renderDicePanel(root: HTMLElement) {
  clear(root);

  // ---- sub tab state ----
  let sub: 'duality' | 'poly' = 'poly';

  const subBar = el('div', { class: 'subtabs' });
  const polyBtn = el('button', { class: 'subtab active', onclick: () => { sub = 'poly'; refresh(); } }, '多面骰 · 标准');
  const dualityBtn = el('button', { class: 'subtab', onclick: () => { sub = 'duality'; refresh(); } }, '二元骰 · 希望/恐惧');
  subBar.append(polyBtn, dualityBtn);

  const body = el('div', { class: 'panel-body' });

  function refresh() {
    dualityBtn.className = 'subtab' + (sub === 'duality' ? ' active' : '');
    polyBtn.className = 'subtab' + (sub === 'poly' ? ' active' : '');
    clear(body);
    if (sub === 'duality') body.append(dualityView());
    else body.append(polyView());
  }

  root.append(subBar, body);
  refresh();
}

function dieBox(label: string, value: number | string, kind: 'hope' | 'fear' | 'plain' | 'adv') {
  return el('div', { class: `die die-${kind}` },
    el('div', { class: 'die-label' }, label),
    el('div', { class: 'die-value' }, String(value)),
  );
}

function dualityView() {
  const wrap = el('div');

  const traitSel = el('select', { class: 'input' }) as HTMLSelectElement;
  traitSel.append(el('option', { value: '' }, '— 选择属性 —'));
  for (const t of TRAITS) traitSel.append(el('option', { value: t.zh }, `${t.zh} ${t.en}`));

  const modInput = el('input', { class: 'input', type: 'number', value: '0', step: '1' }) as HTMLInputElement;

  const rollWith = el('select', { class: 'input' }) as HTMLSelectElement;
  rollWith.append(
    el('option', { value: 'none' }, '无'),
    el('option', { value: 'advantage' }, '优势 (+d6)'),
    el('option', { value: 'disadvantage' }, '劣势 (-d6)'),
  );

  const ampHope = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const ampFear = el('input', { type: 'checkbox' }) as HTMLInputElement;

  const diffInput = el('input', { class: 'input', type: 'number', placeholder: '可选，如 10 或 15' }) as HTMLInputElement;

  const resultBox = el('div', { class: 'result-box' });

  function doRoll() {
    const modifier = parseInt(modInput.value || '0', 10) || 0;
    const difficultyRaw = diffInput.value.trim();
    const difficulty = difficultyRaw === '' ? undefined : parseInt(difficultyRaw, 10);
    const res = rollDuality({
      modifier,
      rollingWith: rollWith.value as any,
      amplifyHope: ampHope.checked,
      amplifyFear: ampFear.checked,
      difficulty,
    });
    showResult(resultBox, res);
  }

  const rollBtn = el('button', { class: 'btn primary', onclick: doRoll }, '🎲 投掷二元骰');
  const rerollBtn = el('button', { class: 'btn', onclick: doRoll }, '↻ 再掷');

  wrap.append(
    el('p', { class: 'hint' }, '投掷希望 d12 与恐惧 d12，加上属性调整值。较高的那颗决定叙事走向；双骰相同即为大成功。'),
    field('属性 (Trait)', traitSel),
    field('调整值 (Modifier)', modInput),
    field('优势 / 劣势', rollWith),
    el('div', { class: 'row' },
      el('label', { class: 'check' }, ampHope, el('span', {}, '放大希望骰 (d12→d20)')),
      el('label', { class: 'check' }, ampFear, el('span', {}, '放大恐惧骰 (d12→d20)')),
    ),
    field('难度 (Difficulty，可选)', diffInput),
    el('div', { class: 'btn-row' }, rollBtn, rerollBtn),
    resultBox,
  );
  return wrap;
}

function showResult(box: HTMLElement, res: DualityResult) {
  clear(box);
  const outcomeClass = res.outcome === 'hope' ? 'hope' : res.outcome === 'fear' ? 'fear' : 'critical';

  box.append(
    el('div', { class: `outcome outcome-${outcomeClass}` },
      el('div', { class: 'outcome-title' }, OUTCOME_LABEL[res.outcome]),
      el('div', { class: 'outcome-desc' }, OUTCOME_DESC[res.outcome]),
    ),
  );

  const diceRow = el('div', { class: 'dice-row' });
  diceRow.append(dieBox(`希望 d${res.hopeSides}`, res.hope, 'hope'));
  diceRow.append(dieBox(`恐惧 d${res.fearSides}`, res.fear, 'fear'));
  if (res.rollingWith === 'advantage' && res.advantageDie != null) {
    diceRow.append(dieBox('优势 d6', `+${res.advantageDie}`, 'adv'));
  }
  if (res.rollingWith === 'disadvantage' && res.disadvantageDie != null) {
    diceRow.append(dieBox('劣势 d6', `-${res.disadvantageDie}`, 'adv'));
  }
  box.append(diceRow);

  const calc = el('div', { class: 'calc' });
  let calcText = `希望 ${res.hope} + 恐惧 ${res.fear}`;
  if (res.modifier) calcText += ` + 调整 ${res.modifier}`;
  if (res.rollingWith === 'advantage' && res.advantageDie != null) calcText += ` + 优势 ${res.advantageDie}`;
  if (res.rollingWith === 'disadvantage' && res.disadvantageDie != null) calcText += ` − 劣势 ${res.disadvantageDie}`;
  calc.append(el('div', { class: 'calc-line' }, calcText));
  calc.append(el('div', { class: 'calc-total' }, `总计 = ${res.total}`));
  if (res.difficulty != null) {
    calc.append(el('div', { class: 'calc-line' },
      `对抗难度 ${res.difficulty} → `,
      el('b', { class: res.success ? 'ok' : 'bad' }, res.success ? '成功' : '失败'),
    ));
  }
  box.append(calc);
}

function polyView() {
  const wrap = el('div');

  const sidesSel = el('select', { class: 'input' }) as HTMLSelectElement;
  for (const s of [4, 6, 8, 10, 12, 20, 100]) sidesSel.append(el('option', { value: String(s) }, `d${s}`));

  const countInput = el('input', { class: 'input', type: 'number', value: '1', min: '1', max: '50' }) as HTMLInputElement;
  const modInput = el('input', { class: 'input', type: 'number', value: '0' }) as HTMLInputElement;

  const resultBox = el('div', { class: 'result-box' });

  function doRoll() {
    const sides = parseInt(sidesSel.value, 10);
    const count = Math.max(1, parseInt(countInput.value || '1', 10));
    const mod = parseInt(modInput.value || '0', 10);
    const r = rollPolyhedral(sides, count, mod);
    clear(resultBox);
    const diceRow = el('div', { class: 'dice-row wrap' });
    for (const v of r.rolls) diceRow.append(dieBox(`d${sides}`, v, 'plain'));
    resultBox.append(diceRow);
    const calc = el('div', { class: 'calc' });
    calc.append(el('div', { class: 'calc-line' }, `${count}d${sides}` + (mod ? (mod > 0 ? ` + ${mod}` : ` − ${Math.abs(mod)}`) : '') + ' = ' + r.rolls.join(' + ')));
    calc.append(el('div', { class: 'calc-total' }, `总计 = ${r.total}`));
    resultBox.append(calc);
  }

  wrap.append(
    el('p', { class: 'hint' }, '标准多面骰投掷（d4–d100，可设数量与调整值）。'),
    field('骰面', sidesSel),
    field('数量', countInput),
    field('调整值', modInput),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', onclick: doRoll }, '🎲 投掷'),
      el('button', { class: 'btn', onclick: doRoll }, '↻ 再掷'),
    ),
    resultBox,
  );
  return wrap;
}

function field(label: string, control: HTMLElement) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}
