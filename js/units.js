// 全域世界參數（單位：世界 unit，1 機體高約 150，y=0 為地面）
export const WORLD = {
  SIZE: 4000,      // 大地圖邊長（正方形戰場）
  G: 2600,         // 重力
  ROUND_TIME: 99,  // 回合秒數
  WALL: 70,        // 邊界內縮
  BODY_H: 150,     // 機體身高
  BODY_W: 74,
  EYE: 118,        // 第一人稱眼高
  R: 46,           // 機體碰撞半徑
  RADAR: 1500,     // 雷達涵蓋半徑
  FOV_F: 0.76,     // 焦距係數
};

// 攻擊類型
// shot: { dmg, speed, cd, count, spread, radius, pierce }
// melee: { dmg, range, cd }
// special: { name, type, dmg, cost }
export const UNITS = [
  {
    id: 'standard',
    name: '原初型',
    en: 'V-78 STANDARD',
    tag: '萬用',
    desc: '攻守均衡的原型機，射擊與近戰都相當出色，適合任何戰術。',
    hp: 1000, speed: 335, jump: 1060, dash: 1150,
    shot:  { dmg: 52, speed: 1180, cd: 0.32, count: 1, spread: 0, radius: 15 },
    melee: { dmg: 95, range: 168, cd: 0.55 },
    special: { name: '全彈齊射', type: 'spread', dmg: 46, cost: 100 },
    bulk: 1, build: 'std',
    pal: { body: '#eef1f7', sec: '#2f5fb0', accent: '#d8342c', visor: '#6ff0ff', beam: '#9dff6a', trim: '#23262e' },
  },
  {
    id: 'command',
    name: '野戰型',
    en: 'Z-01 FIELD',
    tag: '近戰',
    desc: '量產型白兵戰機體，裝甲厚實、機槍連發，接戰後以熱能斧收尾。',
    hp: 1150, speed: 350, jump: 1040, dash: 1180,
    shot:  { dmg: 22, speed: 1320, cd: 0.13, count: 1, spread: 0.05, radius: 12 },
    melee: { dmg: 112, range: 176, cd: 0.6 },
    special: { name: '熱能斧迴旋', type: 'spin', dmg: 62, cost: 100 },
    bulk: 1.06, build: 'std',
    pal: { body: '#75934f', sec: '#3f5a33', accent: '#b2402e', visor: '#ff7a4a', beam: '#ffd166', trim: '#26301f' },
  },
  {
    id: 'sniper',
    name: '冰原狙擊型',
    en: 'I-04 SNIPER',
    tag: '長程',
    desc: '犧牲機動換取射程與火力，專精遠距精準射擊與一擊必殺。',
    hp: 850, speed: 295, jump: 980, dash: 1060,
    shot:  { dmg: 96, speed: 1700, cd: 0.78, count: 1, spread: 0, radius: 17 },
    melee: { dmg: 60, range: 142, cd: 0.7 },
    special: { name: '超長程陽電子狙擊', type: 'snipe', dmg: 175, cost: 100 },
    bulk: 0.96, build: 'slim',
    pal: { body: '#dfeaf5', sec: '#4a7fb5', accent: '#2b3a4a', visor: '#8ef0ff', beam: '#7ce7ff', trim: '#2b3340' },
  },
  {
    id: 'striker',
    name: '沙漠強襲型',
    en: 'S-09 STRIKER',
    tag: '高機動',
    desc: '為機動戰而生，跳躍力與推進力頂級，擅長空中壓制與游擊。',
    hp: 950, speed: 385, jump: 1210, dash: 1260,
    shot:  { dmg: 45, speed: 1240, cd: 0.3, count: 1, spread: 0, radius: 14 },
    melee: { dmg: 86, range: 172, cd: 0.5 },
    special: { name: '追蹤飛彈群', type: 'missiles', dmg: 52, cost: 100 },
    bulk: 0.99, build: 'std',
    pal: { body: '#f0a14b', sec: '#b4602a', accent: '#f7e6c4', visor: '#ffe07a', beam: '#ffd27a', trim: '#3a2a1e' },
  },
  {
    id: 'shadow',
    name: '暗影型',
    en: 'D-13 SHADOW',
    tag: '突擊',
    desc: '低装甲高輸出的隱匿機，以速度撕開防線，瞬間近身斬殺。',
    hp: 800, speed: 425, jump: 1150, dash: 1340,
    shot:  { dmg: 40, speed: 1420, cd: 0.22, count: 1, spread: 0, radius: 13 },
    melee: { dmg: 76, range: 158, cd: 0.42 },
    special: { name: '瞬身斬', type: 'blink', dmg: 135, cost: 100 },
    bulk: 0.92, build: 'slim',
    pal: { body: '#2e2e39', sec: '#4b2f6b', accent: '#a05cff', visor: '#ff4d6d', beam: '#c07bff', trim: '#17171d' },
  },
  {
    id: 'heavy',
    name: '重裝型',
    en: 'H-77 HEAVY',
    tag: '重火力',
    desc: '厚重裝甲與巨型火砲的移動堡壘，機動慢但一發就能改變戰局。',
    hp: 1300, speed: 275, jump: 900, dash: 1000,
    shot:  { dmg: 92, speed: 940, cd: 0.88, count: 1, spread: 0, radius: 26 },
    melee: { dmg: 106, range: 164, cd: 0.7 },
    special: { name: '火力全開·砲擊陣列', type: 'barrage', dmg: 74, cost: 100 },
    bulk: 1.16, build: 'heavy',
    pal: { body: '#9aa3ad', sec: '#5b636d', accent: '#e2b539', visor: '#ffb020', beam: '#ff9f45', trim: '#2a2d33' },
  },
];

export const unitById = (id) => UNITS.find((u) => u.id === id) || UNITS[0];

// 選機畫面的數值條（0..1）
export const unitBars = (u) => ({
  hp: (u.hp - 780) / (1300 - 780),
  spd: (u.speed - 265) / (425 - 265),
  fire: (u.shot.dmg / u.shot.cd) / 320,
});
