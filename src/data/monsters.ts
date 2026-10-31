import type { Monster } from '../types';

// Full adversary list transcribed from the Daggerheart Chinese wiki
// (https://daggerheart.huijiwiki.com/wiki/敌人列表). Columns:
//   名称(中)|名称(英)|位阶|种类|难度|生命点|压力点
const RAW = `
锯齿刀盗贼|JAGGED KNIFE BANDIT|1|标准|12|5|3
牛头人破坏者|MINOTAUR WRECKER|2|斗士|16|7|5
恐尸|DIRE WIGHT|3|斗士|15|8|4
丧尸群|ZOMBIE PACK|1|集群|8|6|3
贪婪矿工|COVETOUS MINERS|3|集群|16|6|3
警卫队长|HEAD GUARD|1|头目|15|7|3
荆棘鞭|BRIARWHIP|1|头目|14|6|4
巨鼠|GIANT RAT|1|杂兵|10|1|1
崇拜魔仆|IDOLIZING IMP|3|杂兵|17|1|1
战争法师|WAR WIZARD|2|远程|16|5|6
冰荒猎人|ICEWASTE HUNTER|2|远程|13|5|4
锯齿刀影子|JAGGED KNIFE SHADOW|1|潜伏|12|3|3
晶辉龙|GLITTERWYRM|2|潜伏|14|5|4
商人|MERCHANT|1|社交|12|3|3
村庄长者|VILLAGE ELDER|1|社交|14|2|4
幼年闪光蜓|JUVENILE FLICKERFLY|2|独狼|14|10|5
恶堕巨像|MALEFACTED GIANT|2|独狼|15|10|5
持刃警卫|BLADED GUARD|1|标准|12|5|2
刃舞小丑|BLADEDANCE JESTER|4|标准|19|5|3
邪教门徒|CULT ADEPT|2|辅助|14|4|6
森林德鲁伊|FOREST DRUID|1|辅助|11|4|5
酸液掘地者|ACID BURROWER|1|独狼|14|8|3
熊|BEAR|1|斗士|14|7|2
洞穴食人魔|CAVE OGRE|1|独狼|13|8|3
构装体|CONSTRUCT|1|独狼|13|9|4
宫廷侍臣|COURTIER|1|社交|12|3|4
深根守卫|DEEPROOT DEFENDER|1|斗士|10|7|3
恐狼|DIRE WOLF|1|潜伏|12|4|3
巨蚊群|GIANT MOSQUITOES|1|集群|10|6|3
巨蝎|GIANT SCORPION|1|斗士|13|6|3
玻璃蛇|GLASS SNAKE|1|标准|14|5|3
扰敌者|HARRIER|1|标准|12|3|3
持弓警卫|ARCHER GUARD|1|远程|10|3|2
锯齿刀咒术师|JAGGED KNIFE HEXER|1|辅助|13|4|4
锯齿刀碎膝者|JAGGED KNIFE KNEEBREAKER|1|斗士|12|7|4
锯齿刀喽啰|JAGGED KNIFE LACKEY|1|杂兵|9|1|1
锯齿刀队长|JAGGED KNIFE LIEUTENANT|1|头目|13|6|3
锯齿刀狙击手|JAGGED KNIFE SNIPER|1|远程|13|3|2
小型混沌元素|MINOR CHAOS ELEMENTAL|1|独狼|14|7|3
小型火元素|MINOR FIRE ELEMENTAL|1|独狼|13|9|3
小型恶魔|MINOR DEMON|1|独狼|14|8|4
小型树人|MINOR TREANT|1|杂兵|10|1|1
绿色软泥怪|GREEN OOZE|1|潜伏|8|5|2
微型绿色软泥怪|TINY GREEN OOZE|1|潜伏|14|2|1
红色软泥怪|RED OOZE|1|潜伏|10|5|3
微型红色软泥怪|TINY RED OOZE|1|潜伏|11|2|1
低阶贵族|PETTY NOBLE|1|社交|14|3|5
海盗船长|PIRATE CAPTAIN|1|头目|14|7|5
海盗劫掠者|PIRATE RAIDERS|1|集群|12|4|3
海盗打手|PIRATE TOUGH|1|斗士|13|5|3
雇佣剑客|SELLSWORD|1|杂兵|10|1|1
骷髅弓手|SKELETON ARCHER|1|远程|9|3|2
破土骷髅|SKELETON DREDGE|1|杂兵|8|1|1
骷髅骑士|SKELETON KNIGHT|1|斗士|13|5|2
骷髅战士|SKELETON WARRIOR|1|标准|10|3|2
咒剑士|SPELLBLADE|1|头目|14|6|3
鼠群|SWARM OF RATS|1|集群|10|6|2
木族战士|SYLVAN SOLDIER|1|标准|11|4|2
荆蔓纠结群|TANGLE BRAMBLE SWARM|1|集群|12|6|3
荆蔓纠结体|TANGLE BRAMBLE|1|杂兵|11|1|1
武器大师|WEAPONMASTER|1|斗士|14|6|3
幼年树精|YOUNG DRYAD|1|头目|11|6|2
蛮力丧尸|BRAWNY ZOMBIE|1|斗士|10|7|4
拼接尸魔|PATCHWORK ZOMBIE HULK|1|独狼|13|10|3
腐烂丧尸|ROTTED ZOMBIE|1|杂兵|8|1|1
蹒跚丧尸|SHAMBLING ZOMBIE|1|标准|10|4|1
弓箭手小队|ARCHER SQUADRON|2|集群|13|4|3
刺客学徒|APPRENTICE ASSASSIN|2|杂兵|13|1|1
刺客毒师|ASSASSIN POISONER|2|潜伏|14|4|4
刺客大师|MASTER ASSASSIN|2|头目|15|7|5
战斗匣|BATTLE BOX|2|独狼|15|8|6
混沌颅骨|CHAOS SKULL|2|远程|15|5|4
应征兵|CONSCRIPT|2|杂兵|12|1|1
交际花|COURTESAN|2|社交|13|3|4
邪教爪牙|CULT FANG|2|潜伏|15|4|4
邪教学徒|CULT INITIATE|2|杂兵|13|1|1
恶魔猎犬群|DEMONIC HOUND PACK|2|集群|15|6|3
电鳗群|ELECTRIC EELS|2|集群|14|5|3
精锐士兵|ELITE SOLDIER|2|标准|15|4|3
失败实验体|FAILED EXPERIMENT|2|标准|13|3|3
巨人驯兽师|GIANT BEASTMASTER|2|头目|16|6|5
巨人斗士|GIANT BRAWLER|2|斗士|15|7|4
巨人新兵|GIANT RECRUIT|2|杂兵|13|1|2
巨鹰|GIANT EAGLE|2|潜伏|14|4|4
戈尔贡|GORGON|2|独狼|15|9|3
王国骑士|KNIGHT OF THE REALM|2|头目|15|6|4
蒙面盗贼|MASKED THIEF|2|潜伏|14|4|5
商业大亨|MERCHANT BARON|2|社交|15|5|3
命定猎手|MORTAL HUNTER|2|头目|16|6|4
皇家顾问|ROYAL ADVISOR|2|社交|14|3|3
守密人|SECRET-KEEPER|2|头目|16|7|4
鲨鱼|SHARK|2|斗士|14|7|3
塞壬海妖|SIREN|2|潜伏|14|5|3
幽灵弓箭手|SPECTRAL ARCHER|2|远程|13|3|3
幽灵队长|SPECTRAL CAPTAIN|2|头目|16|6|4
幽灵守护者|SPECTRAL GUARDIAN|2|标准|15|4|3
间谍|SPY|2|社交|15|4|3
石影兽|STONEWRAITH|2|潜伏|13|6|3
成年闪光蜓|ADULT FLICKERFLY|3|独狼|17|12|6
贪婪恶魔|DEMON OF AVARICE|3|辅助|17|6|5
绝望恶魔|DEMON OF DESPAIR|3|潜伏|17|6|5
傲慢恶魔|DEMON OF HUBRIS|3|头目|18|7|5
嫉妒恶魔|DEMON OF JEALOUSY|3|远程|17|6|6
愤怒恶魔|DEMON OF WRATH|3|斗士|17|7|5
巨型蝙蝠|DIRE BAT|3|潜伏|14|5|3
树精|DRYAD|3|头目|16|8|5
元素火花|ELEMENTAL SPARK|3|杂兵|15|1|1
高阶土元素|GREATER EARTH ELEMENTAL|3|斗士|17|10|4
高阶水元素|GREATER WATER ELEMENTAL|3|辅助|17|5|5
巨型绿色软泥怪|HUGE GREEN OOZE|3|潜伏|15|7|4
多头蛇|HYDRA|3|独狼|18|10|5
君主|MONARCH|3|社交|16|6|5
雄鹿骑士|STAG KNIGHT|3|标准|17|7|5
橡木树人|OAK TREANT|3|斗士|17|7|4
树人幼苗|TREANT SAPLING|3|杂兵|14|1|1
吸血鬼首领|HEAD VAMPIRE|3|头目|17|6|6
吸血鬼|VAMPIRE|3|标准|16|5|4
宝库守卫典狱长|VAULT GUARDIAN GAOLER|2|辅助|16|5|3
宝库守卫哨兵|VAULT GUARDIAN SENTINEL|3|斗士|17|6|3
宝库守卫炮台|VAULT GUARDIAN TURRET|3|远程|16|5|4
青年冰龙|YOUNG ICE DRAGON|3|独狼|18|10|6
至高死灵师|ARCH-NECROMANCER|4|头目|21|9|8
堕天突击兵|FALLEN SHOCK TROOP|4|杂兵|18|1|1
堕天术士|FALLEN SORCERER|4|辅助|19|6|5
堕天战神：破域者|FALLEN WARLORD：REALM-BREAKER|4|独狼|20|8|5
堕天战神：无败冠军|FALLEN WARLORD：UNDEFEATED CHAMPION|4|独狼|18|11|5
圣化弓手|HALLOWED ARCHER|4|远程|19|3|2
圣化士兵|HALLOWED SOLDIER|4|杂兵|18|1|2
上位神使|HIGH SERAPH|4|头目|20|7|5
克拉肯|KRAKEN|4|独狼|20|11|8
末日神谕者|ORACLE OF DOOM|4|独狼|20|11|10
异界憎恶体|OUTER REALMS ABOMINATION|4|斗士|19|7|5
异界腐曜体|OUTER REALMS CORRUPTER|4|辅助|19|4|3
异界仆从|OUTER REALMS THRALL|4|杂兵|17|1|1
火山巨龙：黑曜猎手|VOLCANIC DRAGON：OBSIDIAN PREDATOR|4|独狼|19|6|5
火山巨龙：熔炎天灾|VOLCANIC DRAGON：MOLTEN SCOURGE|4|独狼|20|7|5
火山巨龙：余烬暴君|VOLCANIC DRAGON：ASHEN TYRANT|4|独狼|18|8|5
完化丧尸|PERFECTED ZOMBIE|4|斗士|20|9|4
丧尸军团|ZOMBIE LEGION|4|集群|17|8|5
`;

const BASE: Monster[] = RAW.trim()
  .split('\n')
  .map((line) => {
    const [nameZh, nameEn, tier, typeZh, difficulty, hp, stress] = line.split('|');
    return {
      nameZh,
      nameEn,
      tier: Number(tier),
      typeZh,
      difficulty: Number(difficulty),
      hp: Number(hp),
      stress: Number(stress),
      source: '核心规则书',
    } as Monster;
  });

// Rich detail for a subset (from the Daggerheart SRD adversary data).
const DETAIL: Record<string, Partial<Monster>> = {
  'ACID BURROWER': {
    thresholds: '8 / 15',
    experiences: ['震动感知 +2'],
    attacks: [{ name: '爪击', atk: '+3', range: '邻近', damage: '1d12+2 物理' }],
    features: [
      { name: '无情 (3)', kind: '被动', text: '每 GM 轮可聚焦 3 次。' },
      { name: '破土而出', kind: '动作', text: '标 1 压力，范围敏捷豁免，否则击倒并陷入脆弱。' },
      { name: '喷吐酸液', kind: '动作', text: '前方近距离攻击 2d6，强制标护甲槽，否则标 1 HP 且 GM 获 1 恐惧。' },
      { name: '酸液沐浴', kind: '反应', text: '受严重伤时近距离 1d10，地面残留 1d6。' },
    ],
  },
  BEAR: {
    thresholds: '9 / 17',
    experiences: ['伏击者 +3', '敏锐感知 +2'],
    attacks: [{ name: '爪击', atk: '+1', range: '近战', damage: '1d8+3 物理' }],
    features: [
      { name: '压倒性力量', kind: '被动', text: '普攻标 HP 目标击退至邻近。' },
      { name: '啃咬', kind: '动作', text: '标 1 压力，近战 3d4+10 并束缚。' },
      { name: '乘胜追击', kind: '反应', text: '命中 PC 时 GM 获 1 恐惧。' },
    ],
  },
  'GIANT MOSQUITOES': {
    thresholds: '5 / 9',
    experiences: ['伪装 +2'],
    attacks: [{ name: '口器', atk: '+2', range: '近战', damage: '1d8+3 物理' }],
    features: [
      { name: '集群 (1d4+1)', kind: '被动', text: '半血后普攻改为 1d4+1。' },
      { name: '飞行', kind: '被动', text: '飞行时难度 +2。' },
      { name: '吸血', kind: '反应', text: '标 1 压力，强制目标额外标 1 HP。' },
    ],
  },
  COURTIER: {
    thresholds: '4 / 8',
    experiences: ['社交名流 +3'],
    attacks: [{ name: '匕首', atk: '-4', range: '近战', damage: '1d4+2 物理' }],
    features: [
      { name: '嘲讽', kind: '动作', text: '标 1 压力，目标风度豁免失败则标 2 压力并陷入脆弱。' },
      { name: '替罪羊', kind: '动作', text: '花费 1 恐惧，让人群误认 PC 为祸首。' },
    ],
  },
  HEAD_GUARD: {
    nameEn: 'HEAD GUARD',
    thresholds: '7 / 13',
    experiences: ['指挥官 +2', '本地知识 +2'],
    attacks: [{ name: '钉头锤', atk: '+4', range: '近战', damage: '1d10+4 物理' }],
    features: [
      { name: '集结卫兵', kind: '动作', text: '花费 2 恐惧，聚焦自身并给 2d4 盟友。' },
      { name: '听我号令', kind: '反应', text: '倒计时 5，触发弓手优势攻击。' },
      { name: '乘胜追击', kind: '反应', text: '命中 PC 时 GM 获 1 恐惧。' },
    ],
  },
  'ARCHER GUARD': {
    thresholds: '4 / 8',
    experiences: ['本地知识 +3'],
    attacks: [{ name: '长弓', atk: '+1', range: '远距离', damage: '1d8+3 物理' }],
    features: [
      { name: '蹒跚射击', kind: '动作', text: '远距离攻击，标 1 压力造成 1d12+3，目标标 HP 则敏捷劣势。' },
    ],
  },
  'JAGGED KNIFE HEXER': {
    thresholds: '5 / 9',
    experiences: ['魔法知识 +2'],
    attacks: [{ name: '法杖', atk: '+2', range: '远距离', damage: '1d6+2 魔法' }],
    features: [
      { name: '诅咒', kind: '动作', text: '远距离施加诅咒，目标掷希望时标 1 压力转为恐惧。' },
      { name: '混沌涌动', kind: '动作', text: '邻近至多 3 目标，标 1 压力造成 2d6+3 魔法。' },
    ],
  },
  'DARKWEAVE CRAWLER': {
    nameZh: '暗织爬蛛',
    nameEn: 'DARKWEAVE CRAWLER',
    tier: 1,
    typeZh: '杂兵',
    difficulty: 10,
    hp: 1,
    stress: 1,
    thresholds: '无',
    experiences: ['黑暗 +3'],
    attacks: [{ name: '咬噬', atk: '-2', range: '近战', damage: '2 物理' }],
    features: [
      { name: '杂兵 (3)', kind: '被动', text: '受任意伤害即败，每 3 伤额外部署 1 杂兵。' },
      { name: '毛骨悚然', kind: '动作', text: '花费 1 恐惧，强制邻近 PC 标 1 压力。' },
      { name: '群体攻击', kind: '动作', text: '花费 1 恐惧，共享攻击。' },
      { name: '暗织毒液', kind: '反应', text: '标 1 压力使目标力竭。' },
    ],
  },
  'ATOTOTL': {
    nameZh: '水鸟',
    nameEn: 'ATOTOTL',
    tier: 1,
    typeZh: '标准',
    difficulty: 12,
    hp: 5,
    stress: 3,
    thresholds: '8 / 12',
    experiences: ['飞行 +3', '丛林 +3'],
    attacks: [{ name: '利爪', atk: '+1', range: '近战', damage: '1d8+1 物理' }],
    features: [
      { name: '风之主', kind: '被动', text: '飞行时受击劣势。' },
      { name: '预兆之石', kind: '被动', text: '搜尸者掷命运骰，偶数 PC 获希望（半数），奇数 GM 获恐惧（半数）。' },
      { name: '射手克星', kind: '反应', text: '花费 1 恐惧，反弹远距离武器攻击。' },
    ],
  },
  'AHUIZOTL': {
    nameZh: '水猴子',
    nameEn: 'AHUIZOTL',
    tier: 1,
    typeZh: '潜伏',
    difficulty: 12,
    hp: 4,
    stress: 3,
    thresholds: '5 / 9',
    experiences: ['隐匿 +2', '游泳 +2'],
    attacks: [{ name: '咬噬', atk: '+2', range: '近战', damage: '1d6+2 物理' }],
    features: [
      { name: '水生攻击者', kind: '被动', text: '水中攻击优势 +1d6。' },
      { name: '甩尾', kind: '动作', text: '标 1 压力，邻近 1d8+2。' },
      { name: '拖拽捕获', kind: '动作', text: '花费 1 恐惧，拉入近战并暂时束缚。' },
    ],
  },
};

// Merge rich detail into the base list by English name.
const DETAIL_BY_EN: Record<string, Partial<Monster>> = {};
for (const [k, v] of Object.entries(DETAIL)) {
  DETAIL_BY_EN[(v.nameEn ?? k).toUpperCase()] = v;
}

export const MONSTERS: Monster[] = BASE.map((m) => {
  const d = DETAIL_BY_EN[m.nameEn.toUpperCase()];
  return d ? { ...m, ...d } : m;
});
