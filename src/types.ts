// Shared types for the Daggerheart Owlbear extension.

export type Outcome = 'hope' | 'fear' | 'critical';

export interface DualityResult {
  hope: number;
  fear: number;
  hopeSides: number; // 12 or 20 (amplified)
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
}

export interface PolyResult {
  sides: number;
  rolls: number[];
  modifier: number;
  total: number;
}

export interface Monster {
  nameZh: string;
  nameEn: string;
  tier: number;
  typeZh: string; // 标准 / 斗士 / 潜伏 ...
  difficulty: number; // 闪避/难度
  hp: number;
  stress: number;
  thresholds?: string; // e.g. "8 / 15"
  experiences?: string[];
  attacks?: { name: string; atk: string; range: string; damage: string }[];
  features?: { name: string; kind: string; text: string }[];
  source?: string;
}

export interface Environment {
  nameZh: string;
  nameEn: string;
  tier: number;
  typeZh: string; // 探索 / 险境 / 社交 / 事件
  impulses?: string;
  potentialAdversaries?: string[];
  features?: { name: string; kind: string; text: string }[];
  gmPrompts?: string[];
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
  armor: number;
  proficiency: number;
  hope: number;
  fear: number;
  thresholds: string; // 重伤/严重
  experiences: string[];
  domainCards: string[];
}
