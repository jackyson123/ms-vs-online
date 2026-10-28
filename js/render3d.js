import { WORLD } from './units.js';
import { rr, cap, drawFighter } from './render.js';

/* ======================================================================
   第一人稱 3D 場景（Canvas 2D + 自製透視投影）
   座標：x 向右、z 向前、y 向上（y=0 為地面）
   ====================================================================== */

const NEAR = 6;
const FOG_RGB = [18, 50, 74];
const BOX_RGB = [34, 50, 78];

export function focal(sw, sh) {
  return Math.min(sw, sh) * WORLD.FOV_F;
}

function toCam(cam, x, y, z) {
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  const rx = dx * c - dz * s;
  const rz = dx * s + dz * c;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  return { rx, y: dy * cp - rz * sp, z: dy * sp + rz * cp };
}

export function project(cam, f, sw, sh, x, y, z) {
  const p = toCam(cam, x, y, z);
  if (p.z < NEAR) return null;
  return { x: sw / 2 + (p.rx / p.z) * f, y: sh / 2 - (p.y / p.z) * f, d: p.z };
}

/** 方向向量 → 螢幕座標（用於星空、太陽） */
function dirScreen(g, dx, dy, dz) {
  const { cam, f, sw, sh } = g;
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  const rx = dx * c - dz * s;
  const rz = dx * s + dz * c;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const y2 = dy * cp - rz * sp;
  const z2 = dy * sp + rz * cp;
  if (z2 < 0.06) return null;
  return { x: sw / 2 + (rx / z2) * f, y: sh / 2 - (y2 / z2) * f };
}

function clipSeg(a, b) {
  if (a.z >= NEAR && b.z >= NEAR) return [a, b];
  if (a.z < NEAR && b.z < NEAR) return null;
  const t = (NEAR - a.z) / (b.z - a.z);
  const m = { rx: a.rx + (b.rx - a.rx) * t, y: a.y + (b.y - a.y) * t, z: NEAR };
  return a.z >= NEAR ? [a, m] : [m, b];
}

function clipPoly(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ai = a.z >= NEAR, bi = b.z >= NEAR;
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (NEAR - a.z) / (b.z - a.z);
      out.push({ rx: a.rx + (b.rx - a.rx) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
    }
  }
  return out.length >= 3 ? out : null;
}

function polyPath(ctx, pts, g) {
  const { f, sw, sh } = g;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = sw / 2 + (p.rx / p.z) * f;
    const y = sh / 2 - (p.y / p.z) * f;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const fogMix = (rgb, k) => {
  const t = 1 - k;
  const r = Math.round(rgb[0] * k + FOG_RGB[0] * t);
  const gg = Math.round(rgb[1] * k + FOG_RGB[1] * t);
  const b = Math.round(rgb[2] * k + FOG_RGB[2] * t);
  return `rgb(${r},${gg},${b})`;
};

/* ---------------- 天空 ---------------- */
const STARS = (() => {
  const a = [];
  let s = 20250;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 90; i++) {
    const t = rnd() * Math.PI * 2;
    const u = rnd() * 0.92 + 0.06;
    a.push({ x: Math.cos(t) * Math.sqrt(1 - u * u), y: u, z: Math.sin(t) * Math.sqrt(1 - u * u), r: 0.5 + rnd() * 1.5, p: 0.3 + rnd() * 0.7 });
  }
  return a;
})();

function ridge(x, k) {
  return 46 * Math.sin(x * 0.0042 + k) + 26 * Math.sin(x * 0.0131 + k * 2.3) + 14 * Math.sin(x * 0.031 + k * 4.1);
}

function drawSky(ctx, g, horizon) {
  const { sw, sh, cam, f } = g;
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, 4));
  grad.addColorStop(0, '#02040c');
  grad.addColorStop(0.5, '#061527');
  grad.addColorStop(0.86, '#0d3049');
  grad.addColorStop(1, '#14405c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sw, sh);

  // 星空
  ctx.save();
  for (const s of STARS) {
    const p = dirScreen(g, s.x, s.y, s.z);
    if (!p) continue;
    ctx.fillStyle = `rgba(255,255,255,${0.2 + s.p * 0.6})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.r, 0, 6.284);
    ctx.fill();
  }
  ctx.restore();

  // 太陽
  const sun = dirScreen(g, 0.46, 0.34, -0.82);
  if (sun) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 90);
    rg.addColorStop(0, 'rgba(255,236,190,.95)');
    rg.addColorStop(0.18, 'rgba(255,196,120,.55)');
    rg.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(sun.x - 95, sun.y - 95, 190, 190);
    ctx.restore();
  }

  // 遠山（以 yaw 做視差捲動）
  const ox = -cam.yaw * f;
  for (const layer of [
    { amp: 1.5, base: -6, col: '#0a1c31', k: 1.1, per: 1400 },
    { amp: 1.0, base: 6, col: '#081523', k: 3.7, per: 900 },
  ]) {
    const period = layer.per;
    const off = ((ox * layer.amp) % period + period) % period;
    ctx.fillStyle = layer.col;
    ctx.beginPath();
    ctx.moveTo(-period, horizon + 300);
    for (let x = -period; x <= sw + period; x += 14) {
      ctx.lineTo(x, horizon + layer.base - ridge(x + off, layer.k));
    }
    ctx.lineTo(sw + period, horizon + 300);
    ctx.closePath();
    ctx.fill();
  }

  // 地平線光暈
  const hz = ctx.createLinearGradient(0, horizon - 90, 0, horizon + 30);
  hz.addColorStop(0, 'rgba(70,190,255,0)');
  hz.addColorStop(1, 'rgba(90,210,255,.3)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, horizon - 90, sw, 120);
}

function drawGround(ctx, g, horizon) {
  const { sw, sh } = g;
  const grad = ctx.createLinearGradient(0, horizon, 0, sh);
  grad.addColorStop(0, '#123046');
  grad.addColorStop(0.18, '#0a1626');
  grad.addColorStop(1, '#05080f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizon - 1, sw, sh - horizon + 2);

  // 格線
  const half = WORLD.SIZE / 2;
  ctx.lineWidth = 1;
  for (let x = -half; x <= half; x += 250) line3(ctx, g, x, -half, x, half, false);
  for (let z = -half; z <= half; z += 250) line3(ctx, g, -half, z, half, z, false);
  // 邊界
  line3(ctx, g, -half, -half, half, -half, true);
  line3(ctx, g, -half, half, half, half, true);
  line3(ctx, g, -half, -half, -half, half, true);
  line3(ctx, g, half, -half, half, half, true);
}

function line3(ctx, g, x0, z0, x1, z1, strong) {
  const a = toCam(g.cam, x0, 0, z0);
  const b = toCam(g.cam, x1, 0, z1);
  const c = clipSeg(a, b);
  if (!c) return;
  const { f, sw, sh } = g;
  const p1 = { x: sw / 2 + (c[0].rx / c[0].z) * f, y: sh / 2 - (c[0].y / c[0].z) * f };
  const p2 = { x: sw / 2 + (c[1].rx / c[1].z) * f, y: sh / 2 - (c[1].y / c[1].z) * f };
  const d = (c[0].z + c[1].z) / 2;
  const fog = Math.max(0, 1 - d / 2400);
  ctx.globalAlpha = strong ? 0.25 + 0.6 * fog : 0.05 + 0.42 * fog;
  ctx.strokeStyle = strong ? '#4fe4ff' : '#5f9ad6';
  ctx.lineWidth = strong ? 2.4 : 1.2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---------------- 障礙物 ---------------- */
const FACES = [
  { n: [0, 0, -1], s: 0.74 },
  { n: [0, 0, 1], s: 0.74 },
  { n: [-1, 0, 0], s: 0.58 },
  { n: [1, 0, 0], s: 0.58 },
  { n: [0, 1, 0], s: 1.12 },
];

function drawBox(ctx, g, b, depth) {
  const cam = g.cam;
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const h = b.h;
  const k = Math.max(0, Math.min(1, 1 - depth / 3200));
  const corners = {
    a: [x0, 0, z0], c: [x1, 0, z0], d: [x1, 0, z1], e: [x0, 0, z1],
    A: [x0, h, z0], C: [x1, h, z0], D: [x1, h, z1], E: [x0, h, z1],
  };
  const quads = [
    [corners.a, corners.c, corners.C, corners.A],
    [corners.e, corners.d, corners.D, corners.E],
    [corners.a, corners.e, corners.E, corners.A],
    [corners.c, corners.d, corners.D, corners.C],
    [corners.A, corners.C, corners.D, corners.E],
  ];
  ctx.save();
  for (let i = 0; i < quads.length; i++) {
    const q = quads[i];
    const n = FACES[i].n;
    const fc = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2];
    const vx = cam.x - fc[0], vy = cam.y - fc[1], vz = cam.z - fc[2];
    if (n[0] * vx + n[1] * vy + n[2] * vz <= 0) continue;
    const camPts = q.map((p) => toCam(cam, p[0], p[1], p[2]));
    const clipped = clipPoly(camPts);
    if (!clipped) continue;
    polyPath(ctx, clipped, g);
    ctx.fillStyle = fogMix([BOX_RGB[0] * FACES[i].s, BOX_RGB[1] * FACES[i].s, BOX_RGB[2] * FACES[i].s], k);
    ctx.fill();
    ctx.strokeStyle = `rgba(120,190,255,${0.1 + 0.16 * k})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------- 對手機體（廣告牌） ---------------- */
function drawEnemy(ctx, g) {
  const e = g.enemy;
  const bulk = e.unit.bulk;
  const feet = project(g.cam, g.f, g.sw, g.sh, e.x, e.y, e.z);
  const head = project(g.cam, g.f, g.sw, g.sh, e.x, e.y + WORLD.BODY_H * bulk, e.z);
  if (!feet || !head) return;
  const h = feet.y - head.y;
  if (h < 1) return;

  // 影子
  const gr = project(g.cam, g.f, g.sw, g.sh, e.x, 0, e.z);
  if (gr && e.y > -1) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(gr.x, gr.y, (h * 0.42) * (1 + e.y / 600), h * 0.07, 0, 0, 6.284);
    ctx.fill();
    ctx.restore();
  }

  const scale = h / (WORLD.BODY_H * bulk);
  const ef = { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
  const right = { x: Math.cos(g.cam.yaw), z: -Math.sin(g.cam.yaw) };
  const nose = ef.x * right.x + ef.z * right.z;
  const widthF = 0.56 + 0.44 * Math.abs(nose);
  const mirror = nose >= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(feet.x, feet.y);
  ctx.scale(scale * widthF, scale);
  drawFighter(ctx, { ...e, x: 0, y: 0, facing: mirror, vx: Math.hypot(e.vx, e.vz) }, g.now);
  ctx.restore();
}

/* ---------------- 彈體與粒子 ---------------- */
function drawBullets(ctx, g) {
  for (const b of g.bullets) {
    const head = project(g.cam, g.f, g.sw, g.sh, b.x, b.y, b.z);
    if (!head) continue;
    let tail = project(g.cam, g.f, g.sw, g.sh, b.x - b.vx * 0.055, b.y - b.vy * 0.055, b.z - b.vz * 0.055);
    if (!tail) {
      const ahead = project(g.cam, g.f, g.sw, g.sh, b.x + b.vx * 0.05, b.y + b.vy * 0.05, b.z + b.vz * 0.05);
      if (!ahead) continue;
      tail = { x: head.x - (ahead.x - head.x), y: head.y - (ahead.y - head.y), d: head.d };
    }
    const w = Math.max(2, (b.r * 2 * g.f) / head.d);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    cap(ctx, tail.x, tail.y, head.x, head.y, w + 8, 'rgba(255,255,255,.16)');
    cap(ctx, tail.x, tail.y, head.x, head.y, w, b.color);
    cap(ctx, tail.x, tail.y, head.x, head.y, w * 0.4, '#ffffff');
    ctx.restore();
  }
}

function drawParticles(ctx, g) {
  for (const p of g.particles) {
    const s = project(g.cam, g.f, g.sw, g.sh, p.x, p.y, p.z);
    if (!s) continue;
    const a = p.life / p.maxLife;
    const size = Math.max(1.5, (p.size * g.f) / s.d);
    ctx.save();
    if (p.add) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, Math.min(1, a)) * (p.alpha ?? 1);
    if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, size * 0.16);
      ctx.beginPath();
      ctx.arc(s.x, s.y, size * 0.4 + (1 - a) * size, 0, 6.284);
      ctx.stroke();
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, size * (1.3 - a), 0, 6.284);
      ctx.fill();
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, size * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - (p.vx * 0.02 * g.f) / s.d, s.y + (p.vy * 0.02 * g.f) / s.d);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBeamsWorld(ctx, g) {
  for (const bm of g.beams) {
    const a = bm.life / bm.maxLife;
    const c = clipSeg(toCam(g.cam, bm.x0, bm.y0, bm.z0), toCam(g.cam, bm.x1, bm.y1, bm.z1));
    if (!c) continue;
    const { f, sw, sh } = g;
    const p1 = { x: sw / 2 + (c[0].rx / c[0].z) * f, y: sh / 2 - (c[0].y / c[0].z) * f };
    const p2 = { x: sw / 2 + (c[1].rx / c[1].z) * f, y: sh / 2 - (c[1].y / c[1].z) * f };
    const w = Math.max(3, (bm.w * g.f) / c[0].z);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.strokeStyle = bm.color;
    ctx.lineCap = 'round';
    ctx.lineWidth = w * a + 8;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * a * 0.4 + 3;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- 場景主程式 ---------------- */
export function renderWorld(ctx, g) {
  const { sw, sh } = g;
  const horizon = sh / 2 + g.f * Math.tan(g.cam.pitch);

  drawSky(ctx, g, horizon);
  drawGround(ctx, g, horizon);

  // 依深度排序：障礙物 + 對手
  const items = [];
  for (const b of g.boxes) {
    const p = toCam(g.cam, b.x, b.h * 0.5, b.z);
    if (p.z < NEAR) continue;
    const margin = (Math.max(b.w, b.d) * 0.7 * g.f) / p.z;
    const sx = sw / 2 + (p.rx / p.z) * g.f;
    const sy = sh / 2 - (p.y / p.z) * g.f;
    if (sx + margin < -40 || sx - margin > sw + 40 || sy + margin < -40 || sy - margin > sh + 40) continue;
    items.push({ d: p.z, kind: 0, b });
  }
  const ep = toCam(g.cam, g.enemy.x, 75, g.enemy.z);
  items.push({ d: Math.max(1, ep.z), kind: 1 });
  items.sort((a, b) => b.d - a.d);

  for (const it of items) {
    if (it.kind === 0) drawBox(ctx, g, it.b, it.d);
    else drawEnemy(ctx, g);
  }

  drawBeamsWorld(ctx, g);
  drawParticles(ctx, g);
}

/* ======================================================================
   HUD
   ====================================================================== */
function bar(ctx, x, y, w, h, ratio, colA, colB, right) {
  ctx.fillStyle = 'rgba(4,8,16,.72)';
  rr(ctx, x, y, w, h, h * 0.35); ctx.fill();
  const iw = Math.max(0, Math.min(1, ratio)) * (w - 4);
  if (iw > 0.5) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, colA);
    g.addColorStop(1, colB);
    ctx.fillStyle = g;
    const bx = right ? x + w - 2 - iw : x + 2;
    rr(ctx, bx, y + 2, iw, h - 4, (h - 4) * 0.35); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, h * 0.35); ctx.stroke();
}

function drawBars(ctx, g) {
  const { sw, bleed } = g;
  const k = Math.max(0.7, Math.min(1.3, g.sh / 540));
  const pad = bleed.left + 12 * k;
  const barW = Math.min(sw * 0.33, 360 * k);
  const barH = 15 * k;
  const y0 = bleed.top + 14 * k + 26;
  const p = g.player, e = g.enemy;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8f0ff';
  ctx.font = `700 ${13 * k}px system-ui, sans-serif`;
  ctx.fillText(`1P  ${p.unit.name}`, pad, y0 - 9 * k);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8ea2c4';
  ctx.font = `600 ${10 * k}px system-ui, sans-serif`;
  ctx.fillText(`${Math.ceil(p.hp)}`, pad + barW, y0 - 9 * k);
  bar(ctx, pad, y0, barW, barH, p.hp / p.maxHp, '#3ce08a', '#d9f542', false);
  bar(ctx, pad, y0 + barH + 4 * k, barW * 0.78, barH * 0.62, p.energy / 100, '#2fb8ff', '#7ce7ff', false);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8f0ff';
  ctx.font = `700 ${13 * k}px system-ui, sans-serif`;
  ctx.fillText(`${e.unit.name}  CPU`, sw - bleed.right - pad, y0 - 9 * k);
  bar(ctx, sw - bleed.right - pad - barW, y0, barW, barH, e.hp / e.maxHp, '#ffb43c', '#ff5a6a', true);
  bar(ctx, sw - bleed.right - pad - barW * 0.78, y0 + barH + 4 * k, barW * 0.78, barH * 0.62, e.energy / 100, '#ff9f45', '#ffd79a', true);

  // 中央計時
  const cx = sw / 2;
  const boxW = 64 * k, boxH = 40 * k;
  ctx.fillStyle = 'rgba(4,8,16,.75)';
  rr(ctx, cx - boxW / 2, y0 - 6 * k, boxW, boxH, 8 * k); ctx.fill();
  ctx.strokeStyle = 'rgba(67,224,255,.5)';
  ctx.lineWidth = 1.5;
  rr(ctx, cx - boxW / 2, y0 - 6 * k, boxW, boxH, 8 * k); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = g.time <= 10 ? '#ff5a6a' : '#ffffff';
  ctx.font = `800 ${24 * k}px system-ui, sans-serif`;
  ctx.fillText(String(Math.max(0, Math.ceil(g.time))), cx, y0 + 15 * k);

  if (p.energy >= 100) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(g.now * 9);
    ctx.fillStyle = '#ffcf3f';
    ctx.font = `800 ${13 * k}px system-ui, sans-serif`;
    ctx.fillText('必殺 OK', pad + barW * 0.39, y0 + barH + barH * 0.62 + 14 * k);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------------- 雷達（大地圖追蹤） ---------------- */
function drawRadar(ctx, g) {
  const { sw, bleed, cam } = g;
  const k = Math.max(0.7, Math.min(1.3, g.sh / 540));
  const size = Math.max(96, Math.min(148, Math.min(sw, g.sh) * 0.3)) * k;
  const x = bleed.left + 12 * k;
  const y = bleed.top + 14 * k + 26 + 48 * k;
  const cx = x + size / 2, cy = y + size / 2;
  const scale = (size / 2 - 6) / WORLD.RADAR;

  ctx.save();
  ctx.fillStyle = 'rgba(4,10,20,.72)';
  rr(ctx, x, y, size, size, 10); ctx.fill();
  ctx.save();
  rr(ctx, x, y, size, size, 10);
  ctx.clip();

  // 場地與障礙物
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, -1);
  ctx.rotate(cam.yaw);
  const p = g.player;
  ctx.strokeStyle = 'rgba(90,220,255,.5)';
  ctx.lineWidth = 1.5;
  const half = WORLD.SIZE / 2;
  ctx.strokeRect(-half - p.x, -half - p.z, WORLD.SIZE, WORLD.SIZE);
  ctx.fillStyle = 'rgba(120,170,230,.35)';
  for (const b of g.boxes) {
    ctx.fillRect(b.x - p.x - b.w / 2, b.z - p.z - b.d / 2, b.w, b.d);
  }
  ctx.restore();

  // 我方（固定於中心，朝上）
  ctx.fillStyle = '#43e0ff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 7);
  ctx.lineTo(cx - 5, cy + 6);
  ctx.lineTo(cx + 5, cy + 6);
  ctx.closePath();
  ctx.fill();

  // 對手
  const dx = g.enemy.x - g.player.x;
  const dz = g.enemy.z - g.player.z;
  const dist = Math.hypot(dx, dz);
  const a = dx * Math.cos(cam.yaw) - dz * Math.sin(cam.yaw);
  const b2 = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
  let ex = cx + a * scale, ey = cy - b2 * scale;
  const lim = size / 2 - 7;
  const ox = ex - cx, oy = ey - cy;
  const od = Math.hypot(ox, oy);
  const out = od > lim;
  if (out) { ex = cx + (ox / od) * lim; ey = cy + (oy / od) * lim; }
  ctx.fillStyle = g.enemy.ko ? '#7f8ba0' : '#ff5a6a';
  ctx.beginPath();
  ctx.arc(ex, ey, out ? 4.5 : 5, 0, 6.284);
  ctx.fill();
  if (!g.enemy.ko) {
    ctx.strokeStyle = `rgba(255,90,106,${0.35 + 0.35 * Math.sin(g.now * 6)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, 8 + 2 * Math.sin(g.now * 6), 0, 6.284);
    ctx.stroke();
  }
  ctx.restore(); // 解除 clip

  ctx.strokeStyle = 'rgba(90,200,255,.55)';
  ctx.lineWidth = 1.5;
  rr(ctx, x, y, size, size, 10); ctx.stroke();

  ctx.fillStyle = 'rgba(160,210,255,.9)';
  ctx.font = `700 ${10 * k}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('RADAR', cx, y + 5);
  ctx.fillStyle = out ? '#ffcf3f' : '#8ef0ff';
  ctx.font = `700 ${11 * k}px ui-monospace, monospace`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(g.enemy.ko ? '撃墜' : `${Math.round(dist)}m`, cx, y + size - 5);
  ctx.restore();
}

/* ---------------- 鎖定框與標的血條 ---------------- */
function drawTarget(ctx, g) {
  const e = g.enemy;
  if (e.ko) return;
  const bulk = e.unit.bulk;
  const feet = project(g.cam, g.f, g.sw, g.sh, e.x, e.y, e.z);
  const head = project(g.cam, g.f, g.sw, g.sh, e.x, e.y + WORLD.BODY_H * bulk, e.z);
  if (!feet || !head) return;
  const w = Math.abs(feet.y - head.y) * 0.62;
  const cx = (feet.x + head.x) / 2;
  const top = head.y - 14;
  const bot = feet.y;
  if (cx < -w || cx > g.sw + w || bot < -w || top > g.sh + w) return;

  const locked = g.locked;
  ctx.save();
  ctx.strokeStyle = locked ? '#ff5a6a' : 'rgba(255,255,255,.55)';
  ctx.lineWidth = 2;
  const L = Math.max(8, w * 0.34);
  const corners = [
    [cx - w, top, 1, 1], [cx + w, top, -1, 1],
    [cx - w, bot, 1, -1], [cx + w, bot, -1, -1],
  ];
  for (const [px, py, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(px, py + sy * L);
    ctx.lineTo(px, py);
    ctx.lineTo(px + sx * L, py);
    ctx.stroke();
  }

  // 血條 + 距離
  const bw = Math.max(46, w * 1.6);
  const by = top - 16;
  bar(ctx, cx - bw / 2, by, bw, 7, e.hp / e.maxHp, '#ffb43c', '#ff5a6a', false);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = locked ? '#ff9aa6' : 'rgba(220,235,255,.75)';
  ctx.font = '700 11px ui-monospace, monospace';
  const dist = Math.hypot(e.x - g.player.x, e.z - g.player.z);
  ctx.fillText(`${e.unit.name}  ${Math.round(dist)}m`, cx, by - 3);
  ctx.restore();
}

/* ---------------- 準星 ---------------- */
function drawReticle(ctx, g) {
  const cx = g.sw / 2, cy = g.sh / 2;
  const k = Math.max(0.75, Math.min(1.4, g.sh / 560));
  const locked = g.locked;
  ctx.save();
  ctx.strokeStyle = locked ? '#ff5a6a' : 'rgba(190,240,255,.85)';
  ctx.lineWidth = 1.6;
  const gap = 7 * k, len = 9 * k;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * gap, cy + dy * gap);
    ctx.lineTo(cx + dx * (gap + len), cy + dy * (gap + len));
    ctx.stroke();
  }
  ctx.fillStyle = locked ? '#ff5a6a' : 'rgba(190,240,255,.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, 1.7 * k, 0, 6.284);
  ctx.fill();

  // 命中回饋
  if (g.weapon.hitMark > 0) {
    const a = Math.min(1, g.weapon.hitMark / 0.18);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    const m = 13 * k;
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * m * 0.5, cy + dy * m * 0.5);
      ctx.lineTo(cx + dx * m, cy + dy * m);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------------- 第一人稱武器 ---------------- */
function drawWeapon(ctx, g) {
  const pal = g.player.unit.pal;
  const { sw, sh } = g;
  const s = Math.min(sw, sh) / 900;
  const rec = g.weapon.recoil;
  const fire = g.weapon.fire;

  // 近戰：光束軍刀橫掃
  if (g.weapon.melee > 0) {
    const dur = g.weapon.meleeDur || 0.46;
    const q = Math.max(0, Math.min(1, 1 - g.weapon.melee / dur));
    const ease = q * q * (3 - 2 * q);
    const a0 = Math.PI * 1.18, a1 = Math.PI * 0.62;
    const a = a0 + (a1 - a0) * ease;
    const px = sw * 1.02, py = sh * 1.06;
    const L = Math.max(sw, sh) * 1.25;
    ctx.save();
    // 殘影弧
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.beam;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(30, sh * 0.14);
    ctx.beginPath();
    ctx.arc(px, py, L * 0.72, a0, a, false);
    ctx.stroke();
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = Math.max(10, sh * 0.05);
    ctx.beginPath();
    ctx.arc(px, py, L * 0.72, a0, a, false);
    ctx.stroke();
    // 刃
    ctx.globalAlpha = 1;
    const bx = px + Math.cos(a) * L * 0.2, by = py + Math.sin(a) * L * 0.2;
    const ex = px + Math.cos(a) * L * 0.92, ey = py + Math.sin(a) * L * 0.92;
    cap(ctx, bx, by, ex, ey, 26 * s + 10, 'rgba(255,255,255,.2)');
    cap(ctx, bx, by, ex, ey, 26 * s, pal.beam);
    cap(ctx, bx, by, ex, ey, 10 * s, '#ffffff');
    // 手柄
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.trim;
    rr(ctx, bx - 16 * s, by - 16 * s, 32 * s, 32 * s, 6); ctx.fill();
    ctx.restore();
    return;
  }

  // 光束步槍
  const ox = sw * 0.63 + rec * 26 * s * 4;
  const oy = sh * 1.04 + rec * 40 * s * 4;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(-0.42);
  ctx.scale(s, s);

  // 操縱手（機械手）
  ctx.fillStyle = pal.body;
  rr(ctx, -44, -128, 84, 120, 16); ctx.fill();
  ctx.fillStyle = pal.trim;
  for (let i = 0; i < 3; i++) rr(ctx, -36, -60 + i * 24, 66, 15, 6), ctx.fill();

  // 槍身
  ctx.fillStyle = '#262d3d';
  rr(ctx, -32, -232, 64, 160, 10); ctx.fill();
  ctx.fillStyle = pal.sec;
  rr(ctx, -26, -216, 52, 44, 8); ctx.fill();
  ctx.fillStyle = pal.accent;
  rr(ctx, -20, -160, 40, 9, 4); ctx.fill();
  // 瞄準鏡
  ctx.fillStyle = '#1b2130';
  rr(ctx, -10, -300, 58, 54, 10); ctx.fill();
  ctx.fillStyle = pal.visor;
  ctx.beginPath(); ctx.arc(44, -272, 14, 0, 6.284); ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.arc(44, -272, 22, 0, 6.284); ctx.fill();
  ctx.globalAlpha = 1;
  // 槍管
  ctx.fillStyle = '#39414f';
  rr(ctx, -15, -470, 30, 250, 8); ctx.fill();
  ctx.fillStyle = pal.trim;
  rr(ctx, -20, -500, 40, 36, 8); ctx.fill();
  ctx.fillStyle = pal.beam;
  ctx.globalAlpha = 0.75;
  rr(ctx, -4, -452, 8, 200, 4); ctx.fill();
  ctx.globalAlpha = 1;

  // 槍口火光
  if (fire > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pal.beam;
    ctx.globalAlpha = Math.min(1, fire * 1.6);
    ctx.beginPath();
    ctx.moveTo(-34, -500);
    ctx.lineTo(0, -500 - 90 * fire);
    ctx.lineTo(34, -500);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = fire * 0.7;
    ctx.beginPath();
    ctx.arc(0, -505, 46 * fire, 0, 6.284);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------- 畫面後期 ---------------- */
function drawFlash(ctx, g) {
  if (g.hurtFlash <= 0) return;
  const { sw, sh } = g;
  const grad = ctx.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.28, sw / 2, sh / 2, Math.max(sw, sh) * 0.72);
  grad.addColorStop(0, 'rgba(255,40,60,0)');
  grad.addColorStop(1, `rgba(255,40,60,${0.55 * g.hurtFlash})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sw, sh);
}

function drawVignette(ctx, g) {
  const { sw, sh } = g;
  const grad = ctx.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.42, sw / 2, sh / 2, Math.max(sw, sh) * 0.78);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sw, sh);
}

function drawCountdown(ctx, g) {
  if (g.state !== 'countdown') return;
  const { sw, sh } = g;
  const n = Math.ceil(g.countdown);
  const txt = n > 1 ? String(n) : 'FIGHT!';
  const frac = g.countdown - Math.floor(g.countdown);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.25 + 0.75 * frac;
  ctx.fillStyle = n > 1 ? '#ffffff' : '#ffcf3f';
  ctx.font = `900 ${Math.min(sw, sh) * 0.2}px system-ui, sans-serif`;
  ctx.fillText(txt, sw / 2, sh * 0.44);
  ctx.restore();
}

export function renderHUD(ctx, g) {
  drawWeapon(ctx, g);
  drawVignette(ctx, g);
  drawTarget(ctx, g);
  drawReticle(ctx, g);
  drawBars(ctx, g);
  drawRadar(ctx, g);
  drawCountdown(ctx, g);
  drawFlash(ctx, g);
}
