import type { DualityResult, PolyResult, Quadrant } from './types';

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export interface DualityOptions {
  modifier?: number;
  rollingWith?: 'none' | 'advantage' | 'disadvantage';
  difficulty?: number;
  /** GM's 指定点数 — applied to the first die with at least that many faces. */
  force?: number | null;
}

/**
 * Daggerheart "Duality Dice" (二元骰 / 希望与恐惧).
 * Roll a Hope d12 and a Fear d12, add a trait modifier, and compare.
 * Whichever of the two d12s is higher decides Hope (player spotlight) or
 * Fear (GM complication). Matching dice = Critical (auto success + Hope token).
 *
 * Combined with the difficulty check this yields four quadrants:
 * 希望成功 / 希望失败 / 恐惧成功 / 恐惧失败.
 */
export function rollDuality(opts: DualityOptions = {}): DualityResult {
  const hopeSides = 12;
  const fearSides = 12;
  let hope = rollDie(hopeSides);
  let fear = rollDie(fearSides);
  let forced: 'hope' | 'fear' | undefined;
  const force = opts.force ?? null;
  if (force != null) {
    // Only the first die that is big enough is rigged, so forcing 12 doesn't turn
    // both duality dice into an automatic critical.
    if (hopeSides >= force) {
      hope = force;
      forced = 'hope';
    } else if (fearSides >= force) {
      fear = force;
      forced = 'fear';
    }
  }
  const modifier = opts.modifier ?? 0;

  let total = hope + fear + modifier;
  let advantageDie: number | undefined;
  let disadvantageDie: number | undefined;

  if (opts.rollingWith === 'advantage') {
    advantageDie = rollDie(6);
    total += advantageDie;
  } else if (opts.rollingWith === 'disadvantage') {
    disadvantageDie = rollDie(6);
    total -= disadvantageDie;
  }

  const isCritical = hope === fear;
  const higherDie: 'hope' | 'fear' = hope >= fear ? 'hope' : 'fear';
  const outcome: DualityResult['outcome'] = isCritical ? 'critical' : higherDie;

  let success: boolean | undefined;
  if (opts.difficulty != null) {
    // A critical (both dice match) always succeeds.
    success = isCritical ? true : total >= opts.difficulty;
  }

  return {
    hope,
    fear,
    hopeSides,
    fearSides,
    modifier,
    rollingWith: opts.rollingWith ?? 'none',
    advantageDie,
    disadvantageDie,
    total,
    outcome,
    higherDie,
    difficulty: opts.difficulty,
    success,
    forced,
  };
}

/** Standard polyhedral roll: e.g. 3d6+2. */
export function rollPolyhedral(sides: number, count: number, modifier = 0, force: number | null = null): PolyResult {
  const rolls: number[] = [];
  let sum = 0;
  let usedForce = false;
  for (let i = 0; i < count; i++) {
    // A rigged value only applies once per roll and only to dice that can show it.
    const rig = force != null && !usedForce && sides >= force;
    const r = rig ? force! : rollDie(sides);
    if (rig) usedForce = true;
    rolls.push(r);
    sum += r;
  }
  return { sides, rolls, modifier, total: sum + modifier, forced: usedForce };
}

/** A true binary die (d2): returns '真' (1) or '假' (2). */
export function rollBinary(): { value: number; label: string } {
  const v = rollDie(2);
  return { value: v, label: v === 1 ? '真' : '假' };
}

export interface QuadrantInfo {
  id: Quadrant;
  tone: 'hope' | 'fear';
  title: string;
  /** Several interchangeable flavour lines; one is picked per roll. */
  subs: string[];
}

/**
 * The four outcomes, in reading order:
 * row 1 = 希望 (成功 / 失败), row 2 = 恐惧 (成功 / 失败).
 */
export const QUADRANTS: QuadrantInfo[] = [
  {
    id: 'hope-success',
    tone: 'hope',
    title: '希望 · 成功',
    subs: [
      '事情朝着你希望的方向发展！',
      '你抓住了那个瞬间，局面开始向你倾斜。',
      '干净利落——连你自己都没料到会这么顺。',
    ],
  },
  {
    id: 'hope-fail',
    tone: 'hope',
    title: '希望 · 失败',
    subs: [
      '你拼尽了全力，却仍差了那一步。',
      '只差一点。而这一点，恰恰是你此刻拿不出的。',
      '你做到了能做的一切，但这一次，不够。',
    ],
  },
  {
    id: 'fear-success',
    tone: 'fear',
    title: '恐惧 · 成功',
    subs: [
      '你成功了，但代价已经埋下。',
      '目标达成。可你心里清楚，有些东西已经不一样了。',
      '这一手你赢了，只是账单迟早会送到你手上。',
    ],
  },
  {
    id: 'fear-fail',
    tone: 'fear',
    title: '恐惧 · 失败',
    subs: [
      '一切朝着最糟糕的方向而去……',
      '你听见了那个声音——局面正在失控。',
      '最坏的那种可能，此刻正在发生。',
    ],
  },
];

export const CRITICAL_INFO = {
  title: '大成功 · 双骰同值',
  subs: [
    '希望与恐惧同时指向你——命运为你让路，你自动成功并额外获得 1 点希望。',
    '两颗骰子停在同一个数字上。这一刻，连恐惧都替你让步。',
  ],
};

/** Pick one flavour line at random, so repeat rolls do not read identically. */
export function pickSub(subs: string[]): string {
  if (!subs.length) return '';
  return subs[Math.floor(Math.random() * subs.length)];
}

/** Which quadrant a roll landed in (null when critical, or difficulty unknown). */
export function quadrantFor(res: DualityResult): Quadrant | null {
  if (res.outcome === 'critical') return null;
  if (res.success == null) return null;
  const prefix = res.higherDie === 'hope' ? 'hope' : 'fear';
  return `${prefix}-${res.success ? 'success' : 'fail'}` as Quadrant;
}

/** Lookup the info block for a quadrant id. */
export function quadrantInfo(id: Quadrant): QuadrantInfo | undefined {
  return QUADRANTS.find((q) => q.id === id);
}
