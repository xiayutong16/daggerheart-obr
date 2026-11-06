// Dice-expression engine for the polyhedral picker.
//
// Supports "2d6 + 1d20 + 5", "1d8+3", "d20", "adv(1d20)" / "dis(1d20)".
// Advantage / disadvantage here is the familiar "roll twice as many dice and
// keep the highest / lowest half" notation used by the reference panel; the
// Daggerheart NPC rule (2d20 keep high/low) is handled in the quick-roll queue.
export const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;

export type AdvMode = 'none' | 'adv' | 'dis';
export interface DiceGroup { sides: number; count: number }
export interface ParsedExpr {
  valid: boolean;
  error: string;
  groups: DiceGroup[];
  modifier: number;
  adv: AdvMode;
  text: string;
}
export interface DieRoll { sides: number; value: number }
export interface RolledExpr {
  dice: DieRoll[];
  base: number;
  total: number;
  forced: boolean;
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function invalid(error: string, adv: AdvMode = 'none', text = ''): ParsedExpr {
  return { valid: false, error, groups: [], modifier: 0, adv, text };
}

export function parseExpression(raw: string): ParsedExpr {
  const text = (raw || '').trim();
  let s = text.replace(/[−–—]/g, '-').replace(/\s+/g, '').toLowerCase();
  let adv: AdvMode = 'none';
  const wrap = s.match(/^(adv|dis)\((.+)\)$/);
  if (wrap) {
    adv = wrap[1] === 'adv' ? 'adv' : 'dis';
    s = wrap[2];
  }
  if (!s) return invalid('表达式为空', adv, text);

  const parts = s.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join('') !== s) return invalid('表达式格式不正确', adv, text);

  const groups: DiceGroup[] = [];
  let modifier = 0;
  for (const part of parts) {
    let sign = 1;
    let body = part;
    if (body.startsWith('+')) body = body.slice(1);
    else if (body.startsWith('-')) { sign = -1; body = body.slice(1); }
    if (!body) return invalid('表达式格式不正确', adv, text);

    const dm = body.match(/^(\d*)d(\d+)$/);
    if (dm) {
      if (sign < 0) return invalid('骰子数量不能为负', adv, text);
      const count = dm[1] ? parseInt(dm[1], 10) : 1;
      const sides = parseInt(dm[2], 10);
      if (!Number.isFinite(count) || !Number.isFinite(sides) ||
          count < 1 || count > 50 || sides < 2 || sides > 1000) {
        return invalid('骰子数量或面数超出范围', adv, text);
      }
      const found = groups.find(g => g.sides === sides);
      if (found) found.count += count;
      else groups.push({ sides, count });
      groups.sort((a, b) => a.sides - b.sides);
    } else if (/^\d+$/.test(body)) {
      modifier += sign * parseInt(body, 10);
    } else {
      return invalid(`无法识别「${part}」`, adv, text);
    }
  }
  if (!groups.length) return invalid('至少要有 1 组骰子', adv, text);
  return { valid: true, error: '', groups, modifier, adv, text };
}

/** Build a readable expression from the grid state. */
export function expressionText(groups: DiceGroup[], modifier: number, adv: AdvMode): string {
  const body = groups.map(g => `${g.count}d${g.sides}`).join(' + ');
  const mod = modifier ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '';
  const s = (body || '1d20') + mod;
  return adv === 'none' ? s : `${adv}(${s})`;
}

/** Left click adds a die of this size, right click removes one. */
export function bumpGroup(raw: string, sides: number, delta: number): string {
  const p = parseExpression(raw);
  const groups = p.valid ? p.groups.map(g => ({ ...g })) : [];
  const found = groups.find(g => g.sides === sides);
  if (found) {
    found.count += delta;
    if (found.count <= 0) groups.splice(groups.indexOf(found), 1);
  } else if (delta > 0) {
    groups.push({ sides, count: delta });
    groups.sort((a, b) => a.sides - b.sides);
  }
  return expressionText(groups, p.valid ? p.modifier : 0, p.valid ? p.adv : 'none');
}

export function bumpModifier(raw: string, delta: number): string {
  const p = parseExpression(raw);
  return p.valid ? expressionText(p.groups, p.modifier + delta, p.adv) : raw;
}

export function cycleAdv(raw: string): string {
  const p = parseExpression(raw);
  if (!p.valid) return raw;
  const next: AdvMode = p.adv === 'none' ? 'adv' : p.adv === 'adv' ? 'dis' : 'none';
  return expressionText(p.groups, p.modifier, next);
}

/** Biggest die in the expression — used by the GM's 指定点数 feature. */
export function maxSides(expr: ParsedExpr): number {
  return expr.groups.reduce((m, g) => Math.max(m, g.sides), 0);
}

export function rollExpression(expr: ParsedExpr, force: number | null = null): RolledExpr {
  const dice: DieRoll[] = [];
  let forced = false;
  const push = (sides: number, value: number) => {
    if (force != null && !forced && sides >= force) {
      dice.push({ sides, value: force });
      forced = true;
    } else {
      dice.push({ sides, value });
    }
  };
  for (const g of expr.groups) {
    const n = expr.adv === 'none' ? g.count : g.count * 2;
    const vals = Array.from({ length: n }, () => rollDie(g.sides));
    let kept = vals;
    if (expr.adv === 'adv') kept = [...vals].sort((a, b) => b - a).slice(0, g.count);
    else if (expr.adv === 'dis') kept = [...vals].sort((a, b) => a - b).slice(0, g.count);
    for (const v of kept) push(g.sides, v);
  }
  const base = dice.reduce((sum, d) => sum + d.value, 0);
  return { dice, base, total: base + expr.modifier, forced };
}

/** "d6: 3, 5 · d20: 12" */
export function diceDetail(expr: ParsedExpr, rolled: RolledExpr): string {
  const bySide = new Map<number, number[]>();
  for (const d of rolled.dice) {
    const arr = bySide.get(d.sides) || [];
    arr.push(d.value);
    bySide.set(d.sides, arr);
  }
  const parts = [...bySide.entries()].map(([s, vals]) => `d${s}: ${vals.join(', ')}`);
  if (expr.adv !== 'none') parts.unshift(expr.adv === 'adv' ? '优势取高' : '劣势取低');
  if (expr.modifier) parts.push(`调整 ${expr.modifier > 0 ? '+' : ''}${expr.modifier}`);
  return parts.join(' · ');
}
