import { WORLD } from './units.js';
import { renderWorld, renderHUD, focal } from './render3d.js';
import { sfx } from './audio.js';

/* ================= 大地圖 ================= */
export const ARENA = {
  size: WORLD.SIZE,
  boxes: [
    // 中央要塞：擋住正中央視線，必須繞行
    { x: 0, z: 0, w: 520, d: 520, h: 360 },
    // 斜向四棟（留下十字通道）
    { x: -820, z: -820, w: 400, d: 400, h: 640 },
    { x: 820, z: -820, w: 400, d: 400, h: 520 },
    { x: -820, z: 820, w: 400, d: 400, h: 520 },
    { x: 820, z: 820, w: 400, d: 400, h: 640 },
    // 四角高塔
    { x: -1450, z: -1450, w: 420, d: 420, h: 900 },
    { x: 1450, z: -1450, w: 420, d: 420, h: 760 },
    { x: -1450, z: 1450, w: 420, d: 420, h: 760 },
    { x: 1450, z: 1450, w: 420, d: 420, h: 900 },
    // 外圈短牆（保留寬缺口）
    { x: -1500, z: 400, w: 170, d: 520, h: 430 },
    { x: 1500, z: -400, w: 170, d: 520, h: 430 },
    { x: 400, z: 1500, w: 520, d: 170, h: 430 },
    { x: -400, z: -1500, w: 520, d: 170, h: 430 },
    // 低掩體（可跳過）
    { x: -560, z: 1500, w: 300, d: 300, h: 190 },
    { x: 560, z: -1500, w: 300, d: 300, h: 190 },
    { x: -1600, z: 900, w: 300, d: 300, h: 190 },
    { x: 1600, z: -900, w: 300, d: 300, h: 190 },
    { x: -1000, z: 100, w: 280, d: 280, h: 300 },
    { x: 1000, z: -100, w: 280, d: 280, h: 300 },
    // 邊緣殘骸
    { x: 1850, z: 1400, w: 200, d: 500, h: 340 },
    { x: -1850, z: -1400, w: 200, d: 500, h: 340 },
  ],
};

export const makeInput = () => ({
  moveX: 0, moveZ: 0, turn: 0,
  jumpBuf: 0, dashBuf: 0,
  shoot: false, melee: false, special: false,
  lookX: 0, lookY: 0,
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** 射線與 2D AABB 是否相交（dir 為未正規化向量） */
function segAABB(x0, z0, dx, dz, cx, cz, hw, hd) {
  let t0 = 0, t1 = 1;
  const tests = [[x0, dx, cx - hw, cx + hw], [z0, dz, cz - hd, cz + hd]];
  for (const [p, d, mn, mx] of tests) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return false;
    } else {
      let ta = (mn - p) / d, tb = (mx - p) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function resolveCircle(px, pz, r, b) {
  const hw = b.w / 2, hd = b.d / 2;
  const cx = clamp(px, b.x - hw, b.x + hw);
  const cz = clamp(pz, b.z - hd, b.z + hd);
  let dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
  }
  // 圓心在盒子內：往最近的面推出
  const l = px - (b.x - hw), rr_ = (b.x + hw) - px;
  const u = pz - (b.z - hd), dn = (b.z + hd) - pz;
  const m = Math.min(l, rr_, u, dn);
  if (m === l) return { x: -(l + r), z: 0 };
  if (m === rr_) return { x: rr_ + r, z: 0 };
  if (m === u) return { x: 0, z: -(u + r) };
  return { x: 0, z: dn + r };
}

/* ================= 戰鬥機體 ================= */
class Fighter {
  constructor(unit, x, z, yaw, isPlayer) {
    this.unit = unit;
    this.isPlayer = isPlayer;
    this.spawn = { x, z, yaw };
    this.reset();
  }

  reset() {
    const s = this.spawn;
    this.x = s.x; this.z = s.z; this.y = 0;
    this.yaw = s.yaw; this.pitch = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.dashVX = 0; this.dashVZ = 0;
    this.maxHp = this.unit.hp;
    this.hp = this.unit.hp;
    this.energy = 30;
    this.onGround = true;
    this.hurtT = 0; this.dashT = 0; this.dashCd = 0;
    this.shootCd = 0; this.shootT = 0;
    this.meleeTimer = 0; this.meleeDur = 1; this.meleeCd = 0; this.meleeHit = false;
    this.spinT = 0; this.spinTimer = 0; this.spinHits = 0;
    this.specialT = 0;
    this.walkPhase = 0;
    this.ko = false; this.koT = 0;
    this.dmgDealt = 0; this.hits = 0;
  }

  get locked() {
    return this.hurtT > 0 || this.meleeTimer > 0 || this.specialT > 0 || this.ko || this.spinT > 0;
  }

  muzzleBase(yaw) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return {
      x: this.x + rx * 22,
      y: this.y + WORLD.EYE + 4,
      z: this.z + rz * 22,
    };
  }

  /** 射擊方向（已正規化） */
  aimDir(g, target) {
    const m = this.muzzleBase(this.yaw);
    let px, py, pz;
    if (this.isPlayer) {
      if (g.locked && !target.ko) {
        const dist = Math.hypot(target.x - m.x, target.z - m.z);
        const lead = clamp(dist / this.unit.shot.speed, 0, 1.4);
        px = target.x + target.vx * lead;
        py = target.y + 84 + Math.min(260, Math.max(-260, target.vy * lead));
        pz = target.z + target.vz * lead;
      } else {
        const cp = Math.cos(this.pitch);
        return { x: Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: Math.cos(this.yaw) * cp };
      }
    } else {
      const dist = Math.hypot(target.x - m.x, target.z - m.z);
      const lead = clamp(dist / this.unit.shot.speed, 0, 1.4);
      px = target.x + target.vx * lead;
      py = target.y + 84 + Math.min(260, Math.max(-260, target.vy * lead));
      pz = target.z + target.vz * lead;
      // 距離越遠越容易脫靶的角誤差
      const ax = target.x - m.x, az = target.z - m.z;
      const al = Math.hypot(ax, az) || 1;
      const off = (0.02 + dist * 0.00002) * dist * (Math.random() * 2 - 1);
      const offV = (0.016 + dist * 0.000016) * dist * (Math.random() * 2 - 1);
      px += (-az / al) * off + (Math.random() - 0.5) * 24;
      pz += (ax / al) * off + (Math.random() - 0.5) * 24;
      py += offV;
    }
    const dx = px - m.x, dy = py - m.y, dz = pz - m.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / l, y: dy / l, z: dz / l };
  }

  update(dt, inp, target, g) {
    const u = this.unit;
    inp.jumpBuf = Math.max(0, inp.jumpBuf - dt);
    inp.dashBuf = Math.max(0, inp.dashBuf - dt);

    if (this.ko) {
      this.koT += dt;
      this.vy -= WORLD.G * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(0.3, dt);
      this.vz *= Math.pow(0.3, dt);
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
      this.collide(g, target);
      return;
    }

    // 計時器
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.specialT = Math.max(0, this.specialT - dt);
    if (this.meleeTimer > 0) this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    this.energy = Math.min(100, this.energy + 5 * dt);

    // 視角（玩家）
    if (this.isPlayer && (inp.lookX || inp.lookY)) {
      this.yaw += inp.lookX;
      this.pitch = clamp(this.pitch + inp.lookY, -0.62, 0.62);
      inp.lookX = 0; inp.lookY = 0;
    }
    if (inp.turn) this.yaw += inp.turn * 2.6 * dt;

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    if (this.dashT > 0) {
      this.vx = this.dashVX;
      this.vz = this.dashVZ;
      if (Math.random() < 0.6) {
        g.particles.push({
          kind: 'smoke', x: this.x - fx * 30, y: this.y + 60, z: this.z - fz * 30,
          vx: -fx * 60, vy: -20, vz: -fz * 60,
          size: 26 + Math.random() * 16, color: 'rgba(160,220,255,.5)',
          life: 0.3, maxLife: 0.3, add: true,
        });
      }
    } else if (!this.locked) {
      const mx = inp.moveX, mz = inp.moveZ;
      let wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
      const len = Math.hypot(wx, wz);
      if (len > 1) { wx /= len; wz /= len; }
      const speed = u.speed * (this.onGround ? 1 : 0.86);
      const acc = this.onGround ? 3400 : 1700;
      const dvx = wx * speed - this.vx, dvz = wz * speed - this.vz;
      const dl = Math.hypot(dvx, dvz);
      if (dl > 0.001) {
        const step = Math.min(dl, acc * dt);
        this.vx += (dvx / dl) * step;
        this.vz += (dvz / dl) * step;
      }
      if (len < 0.05 && this.onGround) {
        const k = Math.pow(0.002, dt);
        this.vx *= k; this.vz *= k;
      }

      if (inp.dashBuf > 0 && this.dashCd <= 0) {
        const dx = len > 0.1 ? wx : fx;
        const dz = len > 0.1 ? wz : fz;
        this.dashT = 0.24; this.dashCd = 0.72;
        this.dashVX = dx * u.dash;
        this.dashVZ = dz * u.dash;
        if (this.onGround) this.vy = 300;
        sfx.dash();
        g.ring(this.x, this.y + 70, this.z, 60, u.pal.beam);
      }
      if (inp.jumpBuf > 0 && this.onGround) {
        this.vy = u.jump;
        this.onGround = false;
        this.y += 1;
        sfx.jump();
        g.smoke(this.x, this.y, this.z, 10);
      }
      if (inp.shoot && this.shootCd <= 0) this.doShoot(g, target);
      if (inp.melee && this.meleeCd <= 0) this.doMelee(g, target);
      if (inp.special && this.energy >= 100 && this.specialT <= 0) this.doSpecial(g, target);
    } else {
      const k = this.hurtT > 0 ? 0.22 : 0.06;
      const f = Math.pow(k, dt);
      this.vx *= f; this.vz *= f;
    }

    // 近戰判定視窗
    if (this.meleeTimer > 0 && !this.meleeHit) {
      const el = this.meleeDur - this.meleeTimer;
      if (el >= 0.13 && el <= 0.34) this.tryMelee(g, target);
    }
    // 旋轉斬多段判定
    if (this.spinT > 0) {
      this.spinT -= dt;
      this.spinTimer -= dt;
      if (this.spinTimer <= 0 && this.spinHits < 3) {
        this.spinTimer = 0.17;
        this.spinHits += 1;
        this.tryCone(g, target, 300, 1.15, u.special.dmg, 520, 240);
      }
    }

    // 物理
    this.vy -= WORLD.G * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.y <= 0) {
      if (this.vy < -500) g.smoke(this.x, 0, this.z, 8);
      this.y = 0; this.vy = 0; this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.collide(g, target);

    const sp = Math.hypot(this.vx, this.vz);
    if (this.onGround && sp > 30) this.walkPhase += dt * (sp / 26);
    else if (this.onGround) this.walkPhase = 0;
  }

  collide(g, target) {
    const lim = ARENA.size / 2 - WORLD.WALL;
    if (this.x < -lim) { this.x = -lim; if (this.vx < 0) this.vx = 0; }
    if (this.x > lim) { this.x = lim; if (this.vx > 0) this.vx = 0; }
    if (this.z < -lim) { this.z = -lim; if (this.vz < 0) this.vz = 0; }
    if (this.z > lim) { this.z = lim; if (this.vz > 0) this.vz = 0; }

    for (const b of ARENA.boxes) {
      if (this.y > b.h) continue;
      const r = resolveCircle(this.x, this.z, WORLD.R, b);
      if (r) { this.x += r.x; this.z += r.z; }
    }

    const dx = target.x - this.x, dz = target.z - this.z;
    const d = Math.hypot(dx, dz);
    const minD = WORLD.R * 2;
    if (d < minD && d > 0.001 && Math.abs(target.y - this.y) < 150 && !this.ko && !target.ko) {
      const push = (minD - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      this.x -= nx * push; this.z -= nz * push;
      target.x += nx * push; target.z += nz * push;
      const lim2 = ARENA.size / 2 - WORLD.WALL;
      target.x = clamp(target.x, -lim2, lim2);
      target.z = clamp(target.z, -lim2, lim2);
    }
  }

  /* ---------- 攻擊 ---------- */
  doShoot(g, target) {
    const u = this.unit, s = u.shot;
    this.shootCd = s.cd;
    this.shootT = 0.17;
    const dir = this.aimDir(g, target);
    const m = this.muzzleBase(this.yaw);
    const ox = m.x + dir.x * 60, oy = m.y + dir.y * 60, oz = m.z + dir.z * 60;
    const n = s.count || 1;
    const jitter = s.spread || 0;
    for (let i = 0; i < n; i++) {
      const a = (Math.random() * 2 - 1) * jitter;
      const cos = Math.cos(a), sin = Math.sin(a);
      const nx = dir.x * cos + dir.z * sin;
      const nz = -dir.x * sin + dir.z * cos;
      g.bullets.push({
        x: ox, y: oy, z: oz,
        vx: nx * s.speed, vy: (dir.y + (Math.random() * 2 - 1) * jitter) * s.speed, vz: nz * s.speed,
        r: s.radius, dmg: s.dmg, owner: this, life: 2.4,
        color: u.pal.beam, kbx: nx * 260, kby: 90, kbz: nz * 260,
      });
    }
    g.muzzle(ox, oy, oz, u.pal.beam);
    g.addShake(u.build === 'heavy' ? 6 : 2.6);
    if (this.isPlayer) { g.weapon.recoil = 1; g.weapon.fire = 1; }
    if (u.build === 'heavy') sfx.heavy(); else sfx.shoot();
  }

  doMelee(g, target) {
    this.meleeDur = 0.46;
    this.meleeTimer = this.meleeDur;
    this.meleeCd = this.unit.melee.cd;
    this.meleeHit = false;
    this.vx = Math.sin(this.yaw) * 320;
    this.vz = Math.cos(this.yaw) * 320;
    if (this.isPlayer) { g.weapon.melee = this.meleeDur; g.weapon.meleeDur = this.meleeDur; }
    sfx.melee();
  }

  tryMelee(g, target) {
    if (this.tryCone(g, target, this.unit.melee.range * 1.25 + 60, 0.95,
      this.unit.melee.dmg, 460, 300)) {
      this.meleeHit = true;
    } else if (Math.random() < 0.5) {
      this.meleeHit = true; // 揮空
    }
  }

  /** 錐形近戰判定，回傳是否命中 */
  tryCone(g, target, range, halfAngle, dmg, kb, kbUp) {
    if (target.ko) return false;
    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || Math.abs(target.y - this.y) > 190) return false;
    if (Math.abs(angDiff(Math.atan2(dx, dz), this.yaw)) > halfAngle) return false;
    const dir = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    target.takeHit(dmg, dir.x * kb, kbUp, dir.z * kb, g, this);
    g.slash(target.x, target.y + 90, target.z, this.unit.pal.beam);
    return true;
  }

  doSpecial(g, target) {
    const u = this.unit, sp = u.special, pal = u.pal;
    this.energy = 0;
    this.specialT = 0.55;
    sfx.special();
    g.addShake(8);
    g.ring(this.x, this.y + 80, this.z, 80, pal.beam);

    const dir = this.aimDir(g, target);
    const m = this.muzzleBase(this.yaw);
    const fire = (vel, extra) => g.bullets.push({
      x: m.x + vel.x * 50, y: m.y + vel.y * 50, z: m.z + vel.z * 50,
      vx: vel.x, vy: vel.y, vz: vel.z,
      ...extra,
    });
    const yawSpread = (base, ang) => ({
      x: base.x * Math.cos(ang) + base.z * Math.sin(ang),
      y: base.y,
      z: -base.x * Math.sin(ang) + base.z * Math.cos(ang),
    });

    switch (sp.type) {
      case 'spread': {
        this.shootT = 0.45;
        g.delay(0.14, () => {
          sfx.beam();
          for (let i = 0; i < 7; i++) {
            const a = (i - 3) * 0.13;
            const d = yawSpread(dir, a);
            fire({ x: d.x * 1020, y: d.y * 1020, z: d.z * 1020 }, {
              r: 19, dmg: sp.dmg, owner: this, life: 2.4, color: pal.beam,
              kbx: d.x * 300, kby: 110, kbz: d.z * 300,
            });
          }
          g.muzzle(m.x + dir.x * 70, m.y + dir.y * 70, m.z + dir.z * 70, pal.beam);
          g.addShake(10);
        });
        break;
      }
      case 'spin': {
        this.dashT = 0.5; this.dashCd = 0.8;
        this.dashVX = Math.sin(this.yaw) * u.dash * 1.2;
        this.dashVZ = Math.cos(this.yaw) * u.dash * 1.2;
        this.spinT = 0.5; this.spinTimer = 0.05; this.spinHits = 0;
        break;
      }
      case 'snipe': {
        this.shootT = 0.5;
        g.delay(0.2, () => {
          sfx.beam();
          const range = 6000;
          // 找出最近的遮蔽物
          let blockT = range;
          for (const b of ARENA.boxes) {
            if (b.h <= m.y) continue;
            const t = rayAABB(m.x, m.z, dir.x, dir.z, b);
            if (t !== null && t < blockT) blockT = t;
          }
          const ex = m.x + dir.x * blockT, ez = m.z + dir.z * blockT;
          const ey = clamp(m.y + dir.y * blockT, -400, 3000);
          g.beams.push({
            x0: m.x + dir.x * 40, y0: m.y + dir.y * 40, z0: m.z + dir.z * 40,
            x1: ex, y1: ey, z1: ez,
            life: 0.4, maxLife: 0.4, color: pal.beam, w: 40,
          });
          g.addShake(16);
          if (!target.ko) {
            // 目標是否在光束上
            const dx = target.x - m.x, dz = target.z - m.z;
            const t = dx * dir.x + dz * dir.z;
            if (t > 0 && t < blockT) {
              const cxp = m.x + dir.x * t, czp = m.z + dir.z * t;
              const perp = Math.hypot(target.x - cxp, target.z - czp);
              const cy = m.y + dir.y * t;
              if (perp < 105 && cy > target.y - 20 && cy < target.y + 170) {
                target.takeHit(sp.dmg, dir.x * 640, 340, dir.z * 640, g, this);
              } else {
                g.spark(target.x, target.y + 90, target.z, pal.beam, 8);
              }
            }
          }
        });
        break;
      }
      case 'missiles': {
        for (let i = 0; i < 4; i++) {
          g.delay(0.08 * i, () => {
            sfx.shoot();
            g.bullets.push({
              x: m.x + (i % 2 ? -30 : 30), y: m.y + 40 + i * 6, z: m.z,
              vx: dir.x * 460 + (i % 2 ? -160 : 160), vy: 420 + i * 40, vz: dir.z * 460,
              r: 15, dmg: sp.dmg, owner: this, life: 4,
              color: pal.accent, kbx: dir.x * 280, kby: 140, kbz: dir.z * 280,
              homing: true, target, turn: 3.2, missile: true,
            });
          });
        }
        break;
      }
      case 'blink': {
        const d = Math.hypot(target.x - this.x, target.z - this.z) || 1;
        const ux = (target.x - this.x) / d, uz = (target.z - this.z) / d;
        for (let i = 0; i < 6; i++) {
          g.particles.push({
            kind: 'smoke', x: this.x + (Math.random() - 0.5) * 50, y: this.y + 40 + Math.random() * 90, z: this.z + (Math.random() - 0.5) * 50,
            vx: 0, vy: 40, vz: 0, size: 40, color: pal.body, life: 0.4, maxLife: 0.4, add: true,
          });
        }
        this.x = clamp(target.x - ux * 150, -ARENA.size / 2 + WORLD.WALL, ARENA.size / 2 - WORLD.WALL);
        this.z = clamp(target.z - uz * 150, -ARENA.size / 2 + WORLD.WALL, ARENA.size / 2 - WORLD.WALL);
        this.yaw = Math.atan2(ux, uz);
        this.vx = ux * 620; this.vz = uz * 620;
        g.delay(0.05, () => {
          sfx.melee();
          this.tryCone(g, target, 300, 1.2, sp.dmg, 540, 320);
          g.slash(target.x, target.y + 90, target.z, pal.beam);
        });
        break;
      }
      case 'barrage': {
        this.shootT = 0.55;
        for (let i = 0; i < 3; i++) {
          g.delay(0.12 + i * 0.13, () => {
            sfx.heavy();
            const d = yawSpread(dir, (i - 1) * 0.16);
            fire({ x: d.x * 900, y: d.y * 900 - 40, z: d.z * 900 }, {
              r: 30, dmg: sp.dmg, owner: this, life: 3, color: pal.beam,
              kbx: d.x * 440, kby: 220, kbz: d.z * 440,
            });
            g.addShake(9);
          });
        }
        break;
      }
      default: break;
    }
  }

  takeHit(dmg, kx, ky, kz, g, src) {
    if (this.ko) return;
    this.hp -= dmg;
    this.hurtT = 0.3;
    this.meleeTimer = 0;
    this.spinT = 0;
    this.vx = kx;
    this.vz = kz;
    this.vy = Math.max(this.vy, ky);
    this.onGround = false;
    this.energy = Math.min(100, this.energy + 5);
    if (src) {
      src.energy = Math.min(100, src.energy + 8);
      src.dmgDealt += dmg;
      src.hits += 1;
      if (src.isPlayer) g.weapon.hitMark = 0.2;
    }
    g.hitstop(0.055);
    g.addShake(Math.min(16, 5 + dmg * 0.04));
    g.spark(this.x, this.y + 90, this.z, this.unit.pal.accent, 12);
    g.ring(this.x, this.y + 90, this.z, 40, '#ffffff');
    if (this.isPlayer) g.hurtFlash = 0.95;
    if (this.hp <= 0) {
      this.hp = 0;
      this.ko = true;
      this.koT = 0;
      g.onKO(this);
    } else {
      sfx.hurt();
    }
  }
}

/** 射線（原點+方向）與 2D AABB 的最近進入距離 */
function rayAABB(ox, oz, dx, dz, b) {
  const hw = b.w / 2, hd = b.d / 2;
  let t0 = 0, t1 = Infinity;
  const tests = [[ox, dx, b.x - hw, b.x + hw], [oz, dz, b.z - hd, b.z + hd]];
  for (const [p, d, mn, mx] of tests) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return null;
    } else {
      let ta = (mn - p) / d, tb = (mx - p) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
  }
  return t0 >= 0 ? t0 : null;
}

/* ================= AI ================= */
class AIController {
  constructor() {
    this.think = 0;
    this.plan = 'approach';
    this.planT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.wantShoot = false;
    this.wantSpecial = false;
    this.wantDodge = false;
    this.wantJump = false;
  }

  update(dt, me, target, g) {
    const inp = makeInput();
    const dx = target.x - me.x, dz = target.z - me.z;
    const dist = Math.hypot(dx, dz);

    // 轉向（追蹤玩家）
    const want = Math.atan2(dx, dz);
    const diff = angDiff(want, me.yaw);
    const TURN = 3.6;
    me.yaw += clamp(diff, -TURN * dt, TURN * dt);
    const err = Math.abs(angDiff(want, me.yaw));

    this.think -= dt;
    this.planT -= dt;
    if (this.think <= 0) {
      this.think = 0.1 + Math.random() * 0.14;
      this.decide(me, target, g, dist, err);
    }

    const los = !g.blocked(me.x, me.z, target.x, target.z, me.y + WORLD.EYE);

    if (this.wantSpecial && me.energy >= 100 && err < 0.5) {
      inp.special = true;
      this.wantSpecial = false;
      return inp;
    }
    if (this.wantDodge) {
      if (me.dashCd <= 0 && me.onGround) {
        inp.dashBuf = 0.1;
        inp.moveX = this.strafe;
        inp.moveZ = 0;
      } else if (me.onGround) inp.jumpBuf = 0.1;
      this.wantDodge = false;
      return inp;
    }
    if (this.wantJump && me.onGround) {
      inp.jumpBuf = 0.1;
      this.wantJump = false;
    }

    switch (this.plan) {
      case 'approach':
        inp.moveZ = 1; inp.moveX = this.strafe * 0.6;
        break;
      case 'retreat':
        inp.moveZ = -1; inp.moveX = this.strafe * 0.5;
        break;
      case 'strafe':
        inp.moveX = this.strafe;
        break;
      case 'melee':
        if (dist > 170) inp.moveZ = 1;
        if (dist < 300 && me.meleeCd <= 0) inp.melee = true;
        break;
      case 'hold':
        if (dist > 1300) { inp.moveZ = 1; inp.moveX = this.strafe * 0.4; }
        else if (dist < 520) inp.moveZ = -1;
        break;
      default:
        break;
    }

    if (this.wantShoot && err < 0.24 && los && me.shootCd <= 0 && dist < 2600) inp.shoot = true;
    return inp;
  }

  decide(me, target, g, dist, err) {
    const r = Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    const low = me.hp / me.maxHp < 0.3;

    // 來襲彈幕反應
    let threat = false;
    for (const b of g.bullets) {
      if (b.owner === me) continue;
      const rx = b.x - me.x, rz = b.z - me.z;
      const d2 = rx * rx + rz * rz;
      if (d2 > 520 * 520) continue;
      const l = Math.sqrt(d2) || 1;
      const dot = (b.vx * rx + b.vz * rz) / (Math.hypot(b.vx, b.vz) * l);
      if (dot > 0.94 && Math.abs(b.y - (me.y + 90)) < 130) { threat = true; break; }
    }

    this.wantShoot = false;
    this.wantSpecial = false;
    this.wantDodge = false;
    this.wantJump = false;

    if (me.energy >= 100 && dist > 350 && dist < 2600 && err < 0.35 && r < 0.5) {
      this.wantSpecial = true;
      this.plan = 'hold';
      this.planT = 0.5;
      return;
    }
    if (threat && r < 0.6) {
      this.wantDodge = true;
      this.plan = 'strafe';
      this.planT = 0.4;
      return;
    }
    if (dist > 1700) {
      this.plan = 'approach';
      this.wantShoot = true;
      if (r > 0.9) this.wantJump = true;
    } else if (dist > 700) {
      this.wantShoot = true;
      if (r < 0.6) this.plan = 'strafe';
      else if (r < 0.85) this.plan = 'approach';
      else this.plan = 'hold';
    } else if (dist > 320) {
      this.wantShoot = true;
      if (r < (low ? 0.75 : 0.55)) this.plan = 'strafe';
      else if (r < 0.8) this.plan = 'retreat';
      else this.plan = 'approach';
    } else {
      if (r < (low ? 0.35 : 0.6)) this.plan = 'melee';
      else if (r < 0.8) { this.plan = 'retreat'; this.wantShoot = true; }
      else { this.plan = 'strafe'; this.wantShoot = true; }
    }
    this.planT = 0.4 + Math.random() * 0.4;
  }
}

/* ================= 遊戲 ================= */
export class Game {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pUnit = opts.playerUnit;
    this.eUnit = opts.enemyUnit;
    this.input = opts.input;
    this.onEnd = opts.onEnd;
    this.onSpecialReady = opts.onSpecialReady;

    this.boxes = ARENA.boxes;
    this.player = new Fighter(this.pUnit, 0, 1600, Math.PI, true);
    this.enemy = new Fighter(this.eUnit, 0, -1600, 0, false);
    this.ai = new AIController();

    this.bullets = [];
    this.particles = [];
    this.beams = [];
    this.timers = [];
    this.shake = 0;
    this.stopT = 0;
    this.hurtFlash = 0;
    this.locked = false;
    this.weapon = { recoil: 0, fire: 0, melee: 0, meleeDur: 0.46, hitMark: 0 };
    this.bleed = { top: 0, left: 0, right: 0, bottom: 0 };

    this.state = 'countdown';
    this.countdown = 3.0;
    this.time = WORLD.ROUND_TIME;
    this.koTimer = 0;
    this.resultSent = false;

    this.cam = { x: 0, y: WORLD.EYE, z: 1600, yaw: Math.PI, pitch: 0 };
    this.now = 0;
    this.running = false;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.sw = Math.max(320, rect.width || window.innerWidth);
    this.sh = Math.max(240, rect.height || window.innerHeight);
    this.canvas.width = Math.floor(this.sw * this.dpr);
    this.canvas.height = Math.floor(this.sh * this.dpr);
    this.f = focal(this.sw, this.sh);
    const probe = document.getElementById('safe-probe');
    if (probe) {
      const r = probe.getBoundingClientRect();
      this.bleed = {
        left: r.left, top: r.top,
        right: Math.max(0, this.sw - r.right),
        bottom: Math.max(0, this.sh - r.bottom),
      };
    }
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  loop = (ts) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.now = ts / 1000;
    this.step(dt || 0);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  /* ---- 小工具 ---- */
  delay(t, fn) { this.timers.push({ t, fn }); }
  addShake(n) { this.shake = Math.min(34, this.shake + n); }
  hitstop(t) { this.stopT = Math.max(this.stopT, t); }

  /** 從 (x0,z0) 到 (x1,z1) 的視線是否被擋 */
  blocked(x0, z0, x1, z1, eyeY) {
    const dx = x1 - x0, dz = z1 - z0;
    for (const b of this.boxes) {
      if (b.h <= eyeY) continue;
      if (segAABB(x0, z0, dx, dz, b.x, b.z, b.w / 2, b.d / 2)) return true;
    }
    return false;
  }

  spark(x, y, z, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 220 + Math.random() * 520;
      this.particles.push({
        kind: 'spark', x, y, z,
        vx: Math.cos(a) * s, vy: (Math.random() - 0.3) * s, vz: Math.sin(a) * s,
        color, life: 0.24 + Math.random() * 0.2, maxLife: 0.44, add: true, size: 14,
      });
    }
  }

  ring(x, y, z, size, color) {
    this.particles.push({ kind: 'ring', x, y, z, vx: 0, vy: 0, vz: 0, size, color, life: 0.34, maxLife: 0.34, add: true });
  }

  smoke(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'smoke', x: x + (Math.random() - 0.5) * 40, y: y + Math.random() * 14, z: z + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 140, vy: 40 + Math.random() * 90, vz: (Math.random() - 0.5) * 140,
        size: 30 + Math.random() * 26, color: 'rgba(180,200,230,.35)',
        life: 0.5, maxLife: 0.5,
      });
    }
  }

  muzzle(x, y, z, color) {
    this.ring(x, y, z, 26, color);
    this.spark(x, y, z, color, 5);
  }

  slash(x, y, z, color) {
    this.ring(x, y, z, 60, color);
    this.spark(x, y, z, color, 10);
  }

  explode(x, y, z, scale = 1) {
    this.ring(x, y, z, 150 * scale, '#ffffff');
    for (let i = 0; i < 26 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 150 + Math.random() * 660 * scale;
      this.particles.push({
        kind: 'spark', x, y, z,
        vx: Math.cos(a) * s, vy: (Math.random() - 0.2) * s * 0.9, vz: Math.sin(a) * s,
        color: Math.random() < 0.5 ? '#ffcf3f' : '#ff7a3c',
        life: 0.35 + Math.random() * 0.4, maxLife: 0.75, add: true, size: 16,
      });
    }
    for (let i = 0; i < 12 * scale; i++) {
      this.particles.push({
        kind: 'smoke', x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70, z: z + (Math.random() - 0.5) * 70,
        vx: (Math.random() - 0.5) * 240, vy: 60 + Math.random() * 200, vz: (Math.random() - 0.5) * 240,
        size: 46 + Math.random() * 46, color: 'rgba(70,80,100,.55)',
        life: 0.9 + Math.random() * 0.5, maxLife: 1.4,
      });
    }
  }

  onKO(f) {
    sfx.ko();
    this.explode(f.x, f.y + 80, f.z, 1.7);
    this.addShake(26);
    this.hitstop(0.16);
    this.state = 'ko';
    this.koTimer = 1.8;
    this.pendingWin = f !== this.player;
    this.locked = false;
  }

  sendResult() {
    if (this.resultSent) return;
    this.resultSent = true;
    const p = this.player;
    this.onEnd?.({
      win: this.pendingWin,
      hpPct: Math.round((p.hp / p.maxHp) * 100),
      dmg: Math.round(p.dmgDealt),
      hits: p.hits,
      time: Math.max(0, Math.ceil(this.time)),
    });
  }

  /* ---- 鎖定 ---- */
  updateLock() {
    const p = this.player, e = this.enemy;
    if (e.ko || this.state !== 'fight') { this.locked = false; return; }
    const dx = e.x - p.x, dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    const diff = Math.abs(angDiff(Math.atan2(dx, dz), p.yaw));
    const los = !this.blocked(p.x, p.z, e.x, e.z, p.y + WORLD.EYE);
    const cone = this.locked ? 0.85 : 0.46;
    this.locked = dist < 3600 && diff < cone && los;
  }

  /* ---- 主更新 ---- */
  step(dt) {
    this.shake = Math.max(0, this.shake - dt * 34);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    this.weapon.recoil = Math.max(0, this.weapon.recoil - dt * 6);
    this.weapon.fire = Math.max(0, this.weapon.fire - dt * 9);
    this.weapon.melee = Math.max(0, this.weapon.melee - dt);
    this.weapon.hitMark = Math.max(0, this.weapon.hitMark - dt);

    if (this.stopT > 0) {
      this.stopT -= dt;
      this.updateParticles(dt * 0.2);
      this.updateCamera(dt);
      return;
    }

    if (this.timers.length) {
      for (const t of this.timers) t.t -= dt;
      const due = this.timers.filter((t) => t.t <= 0);
      this.timers = this.timers.filter((t) => t.t > 0);
      for (const t of due) t.fn();
    }

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.state = 'fight';
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    const active = this.state === 'fight';

    if (active) {
      this.time -= dt;
      if (this.time <= 0) {
        this.time = 0;
        const pr = this.player.hp / this.player.maxHp;
        const er = this.enemy.hp / this.enemy.maxHp;
        this.pendingWin = pr >= er;
        this.state = 'ko';
        this.koTimer = 1.2;
        this.sfxEnd(pr, er);
      }
    }

    const pin = this.input;
    const ein = active ? this.ai.update(dt, this.enemy, this.player, this) : makeInput();

    this.player.update(dt, pin, this.enemy, this);
    this.enemy.update(dt, ein, this.player, this);

    this.updateLock();
    this.updateBullets(dt);
    this.updateBeams(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

    const ready = this.player.energy >= 100;
    if (ready !== this._ready) {
      this._ready = ready;
      this.onSpecialReady?.(ready);
    }

    if (this.state === 'ko') {
      this.koTimer -= dt;
      if (this.koTimer <= 0) this.sendResult();
    }
  }

  sfxEnd(pr, er) {
    sfx.explode();
    if (pr < er && !this.player.ko) {
      this.player.ko = true;
      this.explode(this.player.x, this.player.y + 80, this.player.z, 1.5);
      this.addShake(22);
    }
  }

  updateBullets(dt) {
    const list = this.bullets;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.life -= dt;

      if (b.homing && b.target && !b.target.ko) {
        const tx = b.target.x, ty = b.target.y + 84, tz = b.target.z;
        const desired = Math.atan2(tx - b.x, tz - b.z);
        const cur = Math.atan2(b.vx, b.vz);
        let diff = angDiff(desired, cur);
        const max = (b.turn || 3) * dt;
        diff = clamp(diff, -max, max);
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        const hor = Math.cos(diff) * sp;
        const na = cur + diff;
        const vyWant = ((ty - b.y) / (Math.hypot(tx - b.x, tz - b.z) || 1)) * hor;
        b.vx = Math.sin(na) * hor;
        b.vz = Math.cos(na) * hor;
        b.vy += clamp(vyWant - b.vy, -300 * dt, 300 * dt);
        if (Math.random() < 0.5) {
          this.particles.push({
            kind: 'smoke', x: b.x, y: b.y, z: b.z, vx: 0, vy: 20, vz: 0,
            size: 22, color: 'rgba(255,190,110,.5)', life: 0.3, maxLife: 0.3, add: true,
          });
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;

      let dead = b.life <= 0 || b.y <= 0 ||
        Math.abs(b.x) > ARENA.size / 2 + 300 || Math.abs(b.z) > ARENA.size / 2 + 300;

      if (!dead) {
        for (const box of this.boxes) {
          if (b.y > box.h) continue;
          if (b.x > box.x - box.w / 2 - b.r && b.x < box.x + box.w / 2 + b.r &&
              b.z > box.z - box.d / 2 - b.r && b.z < box.z + box.d / 2 + b.r) {
            this.spark(b.x, b.y, b.z, b.color, 5);
            dead = true;
            break;
          }
        }
      }

      if (!dead) {
        for (const f of [this.player, this.enemy]) {
          if (f === b.owner || f.ko) continue;
          const cx = f.x, cy = f.y + 78;
          if (Math.abs(b.y - cy) < 90 + b.r &&
              Math.hypot(b.x - cx, b.z - f.z) < WORLD.R + b.r) {
            f.takeHit(b.dmg, b.kbx || 0, b.kby || 90, b.kbz || 0, this, b.owner);
            this.spark(b.x, b.y, b.z, b.color, 6);
            dead = true;
            break;
          }
        }
      }

      if (dead) {
        if (b.missile) this.ring(b.x, b.y, b.z, 40, b.color);
        else if (b.y <= 0 || b.life <= 0) this.spark(b.x, Math.max(b.y, 2), b.z, b.color, 3);
        list.splice(i, 1);
      }
    }
  }

  updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
  }

  updateParticles(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === 'smoke') { p.vy -= 60 * dt; p.vx *= Math.pow(0.4, dt); p.vz *= Math.pow(0.4, dt); }
      else if (p.kind === 'spark') { p.vy -= 900 * dt; p.vx *= Math.pow(0.25, dt); p.vz *= Math.pow(0.25, dt); }
      if (p.y < 1 && p.kind !== 'ring') { p.y = 1; p.vy = Math.abs(p.vy) * 0.2; }
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const moving = Math.hypot(p.vx, p.vz) > 40 && p.onGround;
    const bob = moving ? Math.sin(p.walkPhase * 2) * 2.6 : 0;
    const drop = p.ko ? Math.max(-95, -p.koT * 90) : 0;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.cam.x = p.x + sx * 0.7;
    this.cam.z = p.z + sy * 0.7;
    this.cam.y = p.y + WORLD.EYE + bob + drop + sy * 0.5;
    this.cam.yaw = p.yaw;
    this.cam.pitch = p.pitch + (this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.004 : 0);
    void dt;
  }

  /* ---- 繪製 ---- */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.sw, this.sh);
    renderWorld(ctx, this);
    renderHUD(ctx, this);
  }
}
