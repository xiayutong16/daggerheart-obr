// Shared types for the Daggerheart Owlbear extension.

export type Outcome = 'hope' | 'fear' | 'critical';

/** Which side of the table is looking at the panel. */
export type Role = 'GM' | 'PLAYER';

/** The four resolution quadrants of a duality roll. */
export type Quadrant = 'hope-success' | 'hope-fail' | 'fear-success' | 'fear-fail';

export interface DualityResult {
  hope: number;
  fear: number;
  hopeSides: number; // always 12 (duality dice are never amplified)
  fearSides: number;
  modifier: number;
  rollingWith: 'none' | 'advantage' | 'disadvantage';
  advantageDie?: number; // d6 rolled when advantage
  disadvantageDie?: number; // d6 rolled when disadvantage
  total: number;
  outcome: Outcome; // critical when hope === fear
  higherDie: 'hope' | 'fear';
  difficulty?: number;
  success?: boolean;
  /** Set when a GM-supplied 指定点数 was used for one of the dice. */
  forced?: 'hope' | 'fear';
}

export interface PolyResult {
  sides: number;
  rolls: number[];
  modifier: number;
  total: number;
  /** Set when a GM-supplied 指定点数 was used. */
  forced?: boolean;
}

/** One line in the shared (broadcast) roll log. */
export interface RollLogEntry {
  id: string;
  ts: number;
  author: string;
  color: string;
  gmOnly: boolean;
  kind: 'duality' | 'poly';
  summary: string;
  detail: string;
  /** Duality rolls carry their tone so the table can settle Hope / Fear automatically. */
  tone?: Outcome;
  /** Human-readable note about an automatic settlement, shown in the log. */
  settleNote?: string;
  /** GM-only note: the Fear this roll pushed into the GM's pool. */
  gmSettle?: string;
}

export interface CharData {
  name: string;
  ancestry: string;
  community: string;
  classZh: string;
  subclass: string;
  traits: Record<string, number>; // 敏捷/力量/伶俐/直觉/知识/威仪
  hp: number;
  hpMax: number;
  stress: number;
  stressMax: number;
  evasion: number;
  armor: number; // remaining armor slots
  armorMax: number; // armor score = total slots
  proficiency: number;
  hope: number;
  fear: number;
  thresholds: string; // 重伤/严重
  experiences: string[];
  domainCards: string[];
}
