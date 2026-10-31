// Reference data for the character sheet (Daggerheart).

// 六大属性 (Agility / Strength / Finesse / Instinct / Knowledge / Presence)
export const TRAITS: { zh: string; en: string }[] = [
  { zh: '敏捷', en: 'Agility' },
  { zh: '力量', en: 'Strength' },
  { zh: '伶俐', en: 'Finesse' },
  { zh: '直觉', en: 'Instinct' },
  { zh: '知识', en: 'Knowledge' },
  { zh: '威仪', en: 'Presence' },
];

export interface ClassPreset {
  zh: string;
  en: string;
  hp: number;
  stress: number;
  evasion: number;
}

// 九大职业基础数值 (核心规则书，1 级).
export const CLASSES: ClassPreset[] = [
  { zh: '吟游诗人', en: 'Bard', hp: 5, stress: 6, evasion: 10 },
  { zh: '德鲁伊', en: 'Druid', hp: 6, stress: 5, evasion: 9 },
  { zh: '守卫', en: 'Guardian', hp: 8, stress: 4, evasion: 10 },
  { zh: '游侠', en: 'Ranger', hp: 6, stress: 5, evasion: 11 },
  { zh: '盗贼', en: 'Rogue', hp: 5, stress: 6, evasion: 11 },
  { zh: '炽天使', en: 'Seraph', hp: 6, stress: 5, evasion: 10 },
  { zh: '术士', en: 'Sorcerer', hp: 5, stress: 6, evasion: 10 },
  { zh: '战士', en: 'Warrior', hp: 7, stress: 5, evasion: 10 },
  { zh: '法师', en: 'Wizard', hp: 5, stress: 6, evasion: 9 },
];

// 常用种族 / 社群 / 领域（用于角色卡下拉与参考）.
export const ANCESTRIES = [
  '机巧族 Clank', '魔族 Daemon', '龙裔 Drakona', '矮人 Dwarf', '精灵 Elf',
  '仙灵 Faerie', '兽人 Goliath', '人类 Human', '鬼魅 Orc', '猫人 Catfolk',
  '巨魔 Troll', '史莱姆族 Simiah',
];
export const COMMUNITIES = [
  '学院 Academia', 'underworld 黑道', '法外之徒 Outlaw', '权力 Power',
  '信仰 Piety', '商业 Trade', ' wilderness 荒野', '军旅 Soldiery',
];
export const DOMAINS = [
  '利刃 Blade', '鲜血 Blood', '骨之 Bone', '优雅 Grace', '魔法 Luna',
  '午夜 Midnight', '自然 Nature', '夜空 Night', '铁砧 Anvil', '烈火 Flame',
  '霜雪 Frost', '巨石 Stone', '闪电 Voltage', '光辉 Light', '幽影 Shadow',
  '秘术 Codex', '深海 Tide', '狂风 Gale', '嘶鸣 Splatter',
];
