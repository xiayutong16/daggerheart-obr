import type { DualityResult, PolyResult } from './types';

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export interface DualityOptions {
  modifier?: number;
  rollingWith?: 'none' | 'advantage' | 'disadvantage';
  amplifyHope?: boolean;
  amplifyFear?: boolean;
  difficulty?: number;
}

/**
 * Daggerheart "Duality Dice" (二元骰 / 希望与恐惧).
 * Roll a Hope d12 and a Fear d12, add a trait modifier, and compare.
 * Whichever of the two d12s is higher decides Hope (player spotlight) or
 * Fear (GM complication). Matching dice = Critical (big success + Hope token).
 */
export function rollDuality(opts: DualityOptions = {}): DualityResult {
  const hopeSides = opts.amplifyHope ? 20 : 12;
  const fearSides = opts.amplifyFear ? 20 : 12;
  const hope = rollDie(hopeSides);
  const fear = rollDie(fearSides);
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

  const higherDie: 'hope' | 'fear' = hope >= fear ? 'hope' : 'fear';
  const outcome: DualityResult['outcome'] = hope === fear ? 'critical' : higherDie;

  let success: boolean | undefined;
  if (opts.difficulty != null) success = total >= opts.difficulty;

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
  };
}

/** Standard polyhedral roll: e.g. 3d6+2. */
export function rollPolyhedral(sides: number, count: number, modifier = 0): PolyResult {
  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const r = rollDie(sides);
    rolls.push(r);
    sum += r;
  }
  return { sides, rolls, modifier, total: sum + modifier };
}

/** A true binary die (d2): returns '真' (1) or '假' (2). */
export function rollBinary(): { value: number; label: string } {
  const v = rollDie(2);
  return { value: v, label: v === 1 ? '真' : '假' };
}

export const OUTCOME_LABEL: Record<DualityResult['outcome'], string> = {
  hope: '希望 Hope',
  fear: '恐惧 Fear',
  critical: '大成功 Critical!',
};

export const OUTCOME_DESC: Record<DualityResult['outcome'], string> = {
  hope: '希望骰更高 — 你获得 1 点希望，并掌控叙事。',
  fear: '恐惧骰更高 — GM 获得 1 点恐惧，并引入一个复杂情况。',
  critical: '双骰相同 — 大成功！获得 1 点希望，并清除 1 点压力。',
};
