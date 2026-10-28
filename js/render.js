import { WORLD } from './units.js';

/* ================= 基礎工具 ================= */
export function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

export function cap(ctx, x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// 二段式 IK：forward=1 拐點朝 +x，-1 朝 -x
function ik2(hx, hy, tx, ty, l1, l2, forward) {
  let dx = tx - hx, dy = ty - hy;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, l1 + l2 - 0.01);
  if (d < 0.001) d = 0.001;
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const k1 = base - A, k2 = base + A;
  const x1 = hx + Math.cos(k1) * l1, x2 = hx + Math.cos(k2) * l1;
  const k = forward > 0 ? (x1 >= x2 ? k1 : k2) : (x1 <= x2 ? k1 : k2);
  return { kx: hx + Math.cos(k) * l1, ky: hy + Math.sin(k) * l1 };
}

/* ================= 機體繪製（供 3D 廣告牌與選機預覽使用） ================= */
function drawLeg(ctx, hx, hy, foot, pal, w) {
  const L1 = 34, L2 = 34;
  const kn = ik2(hx, hy, foot.x, foot.y, L1, L2, 1);
  cap(ctx, hx, hy, kn.kx, kn.ky, w, pal.body);
  cap(ctx, kn.kx, kn.ky, foot.x, foot.y - 4, w * 0.86, pal.sec);
  ctx.fillStyle = pal.trim;
  rr(ctx, foot.x - 12, foot.y - 8, 30, 10, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  rr(ctx, foot.x - 8, foot.y - 8, 20, 3, 1.5);
  ctx.fill();
  ctx.fillStyle = pal.trim;
  ctx.beginPath();
  ctx.arc(kn.kx, kn.ky, w * 0.34, 0, 6.284);
  ctx.fill();
}

function drawArm(ctx, sx, sy, hand, pal, w, back) {
  const L1 = 26, L2 = 26;
  const el = ik2(sx, sy, hand.x, hand.y, L1, L2, back ? -1 : 1);
  cap(ctx, sx, sy, el.kx, el.ky, w, pal.sec);
  cap(ctx, el.kx, el.ky, hand.x, hand.y, w * 0.9, pal.body);
  ctx.fillStyle = pal.trim;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, w * 0.5, 0, 6.284);
  ctx.fill();
  return { ang: Math.atan2(hand.y - el.ky, hand.x - el.kx) };
}

function drawRifle(ctx, hx, hy, ang, u, firing, len) {
  const pal = u.pal;
  const L = len || 1;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.scale(L, L);
  ctx.fillStyle = '#20242e';
  rr(ctx, -30, -6, 20, 13, 3); ctx.fill();
  ctx.fillStyle = pal.trim;
  rr(ctx, -14, -11, 54, 20, 5); ctx.fill();
  ctx.fillStyle = pal.sec;
  rr(ctx, -8, -7, 26, 7, 3); ctx.fill();
  ctx.fillStyle = '#39404f';
  rr(ctx, 36, -6, 44, 10, 4); ctx.fill();
  ctx.fillStyle = pal.accent;
  rr(ctx, 8, 4, 12, 8, 2); ctx.fill();
  if (firing) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pal.beam;
    ctx.beginPath();
    ctx.moveTo(78, -10);
    ctx.lineTo(126, 0);
    ctx.lineTo(78, 10);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawBeamBlade(ctx, x, y, ang, len, color, wide) {
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  cap(ctx, x, y, ex, ey, (wide || 16) + 10, 'rgba(255,255,255,.18)');
  cap(ctx, x, y, ex, ey, wide || 16, color);
  cap(ctx, x, y, ex, ey, (wide || 16) * 0.42, '#ffffff');
  ctx.restore();
}

function thruster(ctx, x, y, len, color, spread) {
  if (len <= 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x + (spread || 2), y + len);
  ctx.lineTo(x - (spread || 2), y + len);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 3, y);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x, y + len * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 繪製機體。f 為戰鬥機體物件（或預覽用的假機體）
 * 本地座標：原點在腳底中心，+x 為面朝方向，y 往下為正
 */
export function drawFighter(ctx, f, time) {
  const u = f.unit, pal = u.pal, b = u.bulk;
  const ko = !!f.ko;
  const meleeDur = f.meleeDur || 1;
  const mProg = f.meleeTimer > 0 ? 1 - f.meleeTimer / meleeDur : -1;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing * b, b);

  let lean = 0;
  if (ko) lean = 1.45;
  else if (f.hurtT > 0) lean = -0.24;
  else if (f.dashT > 0) lean = 0.32;
  else if (!f.onGround) lean = f.vy > 0 ? 0.12 : -0.05;
  else if (f.specialT > 0) lean = 0.1;
  ctx.rotate(lean);

  if (f.hurtT > 0 && !ko) ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(time * 46));

  // ---- 腿部位置 ----
  const hipY = -66;
  let footF = { x: 17, y: 0 }, footB = { x: -17, y: 0 };
  if (ko) {
    footF = { x: 34, y: 2 }; footB = { x: -4, y: 4 };
  } else if (f.dashT > 0) {
    footF = { x: 30, y: -10 }; footB = { x: -28, y: -4 };
  } else if (!f.onGround) {
    footF = { x: 26, y: -16 }; footB = { x: -22, y: -4 };
  } else if (Math.abs(f.vx) > 30) {
    const ph = f.walkPhase;
    footF = { x: 17 + Math.sin(ph) * 26, y: -Math.max(0, Math.sin(ph)) * 16 };
    footB = { x: -17 + Math.sin(ph + Math.PI) * 26, y: -Math.max(0, Math.sin(ph + Math.PI)) * 16 };
  }

  // ---- 手臂位置 ----
  const shF = { x: 24, y: -104 }, shB = { x: -24, y: -104 };
  let handF = { x: 27, y: -76 }, handB = { x: -14, y: -74 };
  let armAng = 0.55, firing = false;
  if (ko) { handF = { x: 42, y: -26 }; handB = { x: -26, y: -30 }; }
  else if (f.dashT > 0) { handF = { x: 22, y: -86 }; handB = { x: -30, y: -74 }; }
  else if (mProg >= 0) {
    const a = -2.1 + Math.pow(Math.max(0, Math.min(1, (mProg - 0.12) / 0.5)), 0.75) * 3.0;
    handF = { x: shF.x + Math.cos(a) * 46, y: shF.y + Math.sin(a) * 46 };
    handB = { x: shB.x + Math.cos(a - 1.6) * 34, y: shB.y + Math.sin(a - 1.6) * 34 };
  } else if (f.shootT > 0) {
    handF = { x: 54, y: -96 }; handB = { x: 22, y: -84 };
    armAng = 0; firing = true;
  } else if (f.specialT > 0) {
    handF = { x: 44, y: -100 }; handB = { x: -34, y: -96 };
    armAng = -0.1;
  } else {
    handF = { x: 32, y: -74 }; handB = { x: -30, y: -78 };
    armAng = 0.62;
  }

  // ---- 後手臂 ----
  drawArm(ctx, shB.x, shB.y, handB, pal, 15, true);

  // ---- 推進背包 ----
  ctx.fillStyle = pal.trim;
  rr(ctx, -44, -112, 30, 50, 7); ctx.fill();
  ctx.fillStyle = pal.sec;
  rr(ctx, -41, -108, 24, 14, 4); ctx.fill();
  const flameLen = ko ? 0 : (f.dashT > 0 ? 64 : (!f.onGround && f.vy > 0 ? 34 : (f.onGround ? 0 : 16)));
  thruster(ctx, -30, -64, flameLen, pal.beam, 4);
  thruster(ctx, -14, -70, flameLen * 0.7, pal.beam, 3);

  // ---- 後腿 ----
  drawLeg(ctx, -16, hipY, footB, { ...pal, body: pal.sec, sec: pal.sec }, 17);

  // ---- 軀幹 ----
  ctx.fillStyle = pal.body;
  rr(ctx, -27, -116, 54, 56, 11); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  rr(ctx, -27, -92, 54, 4, 2); ctx.fill();
  ctx.fillStyle = pal.sec;
  rr(ctx, -16, -110, 34, 30, 6); ctx.fill();
  ctx.fillStyle = pal.accent;
  rr(ctx, -11, -105, 24, 8, 3); ctx.fill();
  ctx.fillStyle = pal.accent;
  ctx.beginPath(); ctx.arc(4, -86, 6, 0, 6.284); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.arc(2.5, -87.5, 2, 0, 6.284); ctx.fill();
  ctx.fillStyle = pal.trim;
  rr(ctx, -21, -70, 42, 18, 6); ctx.fill();
  ctx.fillStyle = pal.sec;
  rr(ctx, -14, -66, 28, 6, 3); ctx.fill();

  // ---- 前腿 ----
  drawLeg(ctx, 16, hipY, footF, pal, 17);

  // ---- 肩甲 ----
  ctx.fillStyle = pal.sec;
  rr(ctx, 18, -120, 34, 30, 9); ctx.fill();
  rr(ctx, -52, -120, 34, 30, 9); ctx.fill();
  ctx.fillStyle = pal.accent;
  rr(ctx, 22, -116, 26, 6, 3); ctx.fill();
  rr(ctx, -48, -116, 26, 6, 3); ctx.fill();

  // ---- 前手臂 + 武器 ----
  const aF = drawArm(ctx, shF.x, shF.y, handF, pal, 16, false);
  if (mProg >= 0 && !ko) {
    drawBeamBlade(ctx, handF.x, handF.y, aF.ang, 96, pal.beam, 15);
  } else if (!ko) {
    const long = u.id === 'sniper' ? 1.5 : 1;
    drawRifle(ctx, handF.x, handF.y, armAng, u, firing, (u.build === 'heavy' ? 1.2 : 1) * long);
  }

  // ---- 頭部 ----
  ctx.fillStyle = pal.body;
  rr(ctx, -18, -145, 36, 32, 8); ctx.fill();
  ctx.fillStyle = '#e9eef5';
  rr(ctx, -2, -137, 20, 17, 5); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  rr(ctx, 2, -133, 12, 3, 1.5); ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pal.visor;
  rr(ctx, -4, -140, 22, 7, 3); ctx.fill();
  ctx.globalAlpha = 0.5;
  rr(ctx, -8, -143, 30, 13, 6); ctx.fill();
  ctx.restore();
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.moveTo(4, -143); ctx.lineTo(34, -162); ctx.lineTo(12, -139);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, -143); ctx.lineTo(-30, -160); ctx.lineTo(-14, -139);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.visor;
  ctx.beginPath(); ctx.arc(2, -144, 4, 0, 6.284); ctx.fill();

  // ---- 必殺光環 ----
  if (f.specialT > 0 && !ko) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 30);
    ctx.strokeStyle = pal.beam;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, -78, 62, 92, 0, 0, 6.284);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 選機畫面預覽 */
export function drawPreview(ctx, unit, w, h, time) {
  const fake = {
    unit, x: 0, y: 0, facing: 1, vx: 0, vy: 0, onGround: true,
    hurtT: 0, dashT: 0, shootT: 0, meleeTimer: 0, meleeDur: 1,
    specialT: 0, walkPhase: 0, ko: false, energy: 0,
  };
  const scale = (h * 0.78) / (WORLD.BODY_H * unit.bulk);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w / 2, h * 0.94);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(0, 0, 52, 10, 0, 0, 6.284); ctx.fill();
  const t = Math.sin(time * 1.6);
  fake.y = -2 - t * 2;
  drawFighter(ctx, fake, time);
  ctx.restore();
}
