import { UNITS, unitById, unitBars } from './units.js';
import { drawPreview } from './render.js';
import { Game, makeInput } from './game.js';
import { sfx, unlock, setMuted, isMuted } from './audio.js';

const $ = (s) => document.querySelector(s);
const screenSelect = $('#screen-select');
const screenBattle = $('#screen-battle');
const grid = $('#unit-grid');
const enemySel = $('#enemy-select');
const btnStart = $('#btn-start');
const btnQuit = $('#btn-quit');
const btnMute = $('#btn-mute');
const btnRematch = $('#btn-rematch');
const btnToSelect = $('#btn-to-select');
const resultEl = $('#result');
const touchUI = $('#touch-ui');
const canvas = $('#game');
const joy = $('#joy');
const joyKnob = joy ? joy.querySelector('i') : null;

const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
const mousePrimary = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

$('#hint-text').textContent = hasTouch
  ? '操作：左下虛擬搖桿移動，畫面右側拖曳轉動視角（第一人稱）｜ 射 光束步槍、斬 光束刀、必殺 滿氣發動、跳 / 衝　·　建議橫置手機遊玩'
  : '操作：滑鼠移動視角（點一下畫面鎖定游標，Esc 解除）｜ W A S D 移動、空白鍵跳、Shift 衝刺、左鍵或 J 射擊、右鍵或 K 光束刀、L 必殺';

let selected = null;
let game = null;
let previewRaf = 0;
let selectActive = true;
const cardCanvases = [];

const battleActive = () => screenBattle.classList.contains('active');
const pointerLocked = () => document.pointerLockElement === canvas;

/* ================= 選機畫面 ================= */
function statRow(label, v) {
  return `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.06, Math.min(1, v)) * 100)}%"></b></i></div>`;
}

function buildGrid() {
  grid.innerHTML = '';
  cardCanvases.length = 0;
  UNITS.forEach((u, i) => {
    const bars = unitBars(u);
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = u.id;
    card.innerHTML = `
      <span class="tag">${u.tag}</span>
      <canvas></canvas>
      <h3>${u.name}</h3>
      <div class="en">${u.en}</div>
      <p class="desc">${u.desc}</p>
      <div class="stats">
        ${statRow('耐久', bars.hp)}
        ${statRow('機動', bars.spd)}
        ${statRow('火力', bars.fire)}
      </div>
      <div class="sp">必殺 · ${u.special.name}</div>
    `;
    card.addEventListener('click', () => selectUnit(u.id, i));
    grid.appendChild(card);
    cardCanvases.push({ cv: card.querySelector('canvas'), unit: u });
  });
}

function selectUnit(id, i) {
  selected = id;
  sfx.select();
  unlock();
  [...grid.children].forEach((c, idx) => c.classList.toggle('selected', idx === i));
  btnStart.disabled = false;
}

function buildEnemyOptions() {
  enemySel.innerHTML = '';
  const o = document.createElement('option');
  o.value = 'random';
  o.textContent = '隨機';
  enemySel.appendChild(o);
  UNITS.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name}（${u.tag}）`;
    enemySel.appendChild(opt);
  });
  enemySel.value = 'random';
}

function previewLoop(ts) {
  if (!selectActive) return;
  const t = ts / 1000;
  for (const c of cardCanvases) {
    const rect = c.cv.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (c.cv.width !== Math.round(w * dpr)) {
      c.cv.width = Math.round(w * dpr);
      c.cv.height = Math.round(h * dpr);
    }
    const ctx = c.cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPreview(ctx, c.unit, w, h, t + c.unit.id.length);
  }
  previewRaf = requestAnimationFrame(previewLoop);
}

function showSelect() {
  selectActive = true;
  screenSelect.classList.add('active');
  screenBattle.classList.remove('active');
  resultEl.classList.add('hidden');
  if (pointerLocked()) document.exitPointerLock();
  if (game) { game.destroy(); game = null; }
  cancelAnimationFrame(previewRaf);
  previewRaf = requestAnimationFrame(previewLoop);
}

/* ================= 戰鬥 ================= */
const input = makeInput();
const keyMove = { x: 0, z: 0 };
const joyMove = { x: 0, z: 0 };

function applyMove() {
  input.moveX = Math.max(-1, Math.min(1, joyMove.x + keyMove.x));
  input.moveZ = Math.max(-1, Math.min(1, joyMove.z + keyMove.z));
}

function pickEnemy() {
  const v = enemySel.value;
  if (v === 'random') {
    const pool = UNITS.filter((u) => u.id !== selected);
    return pool[Math.floor(Math.random() * pool.length)] || UNITS[0];
  }
  return unitById(v);
}

function startBattle() {
  if (!selected) return;
  if (game) { game.destroy(); game = null; }
  unlock();
  sfx.ui();
  selectActive = false;
  cancelAnimationFrame(previewRaf);
  screenSelect.classList.remove('active');
  screenBattle.classList.add('active');
  resultEl.classList.add('hidden');
  resultEl.querySelector('.result-card').classList.remove('lose');
  touchUI.classList.toggle('hidden', !hasTouch);
  if (pointerLocked()) document.exitPointerLock();

  Object.assign(input, makeInput());
  keyMove.x = 0; keyMove.z = 0;
  joyMove.x = 0; joyMove.z = 0;
  applyMove();
  hideJoy();
  pointers.clear();

  const enemyUnit = pickEnemy();
  game = new Game(canvas, {
    playerUnit: unitById(selected),
    enemyUnit,
    input,
    onEnd: showResult,
    onSpecialReady: (ok) => touchUI.querySelector('.b-special')?.classList.toggle('ready', ok),
  });
  game.start();
}

function showResult(r) {
  const card = resultEl.querySelector('.result-card');
  $('#result-tag').textContent = r.win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  $('#result-title').textContent = r.win ? '任務完成' : '機體被擊毀';
  card.classList.toggle('lose', !r.win);
  $('#stat-hp').textContent = `${r.hpPct}%`;
  $('#stat-dmg').textContent = r.dmg;
  $('#stat-hit').textContent = r.hits;
  resultEl.classList.remove('hidden');
  if (pointerLocked()) document.exitPointerLock();
  if (r.win) sfx.ui();
}

btnStart.addEventListener('click', startBattle);
btnRematch.addEventListener('click', () => { sfx.ui(); startBattle(); });
btnToSelect.addEventListener('click', () => { sfx.ui(); showSelect(); });
btnQuit.addEventListener('click', () => { sfx.ui(); showSelect(); });
btnMute.addEventListener('click', () => {
  unlock();
  setMuted(!isMuted());
  btnMute.textContent = isMuted() ? '🔇' : '🔊';
});

/* ================= 視角控制 ================= */
const S_MOUSE = 0.0024;
const S_TOUCH = 0.0056;
const JOY_R = 56;
const pointers = new Map();
let joyId = null;

function addLook(dx, dy, sens) {
  input.lookX += dx * sens;
  input.lookY += -dy * sens;
}

function showJoy(x, y) {
  if (!joy) return;
  joy.style.left = `${x - 66}px`;
  joy.style.top = `${y - 66}px`;
  joy.classList.add('on');
}

function hideJoy() {
  if (!joy) return;
  joy.classList.remove('on');
  if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)';
}

function moveJoy(dx, dy) {
  const len = Math.hypot(dx, dy);
  const cl = Math.min(len, JOY_R);
  const nx = len > 0.001 ? dx / len : 0;
  const ny = len > 0.001 ? dy / len : 0;
  if (joyKnob) joyKnob.style.transform = `translate(${(nx * cl).toFixed(1)}px, ${(ny * cl).toFixed(1)}px)`;
  const mag = Math.min(1, len / JOY_R);
  const m = Math.max(0, (mag - 0.18) / 0.82);
  joyMove.x = nx * m;
  joyMove.z = -ny * m;
  applyMove();
}

canvas.addEventListener('pointerdown', (e) => {
  if (!battleActive()) return;
  unlock();
  if (e.pointerType === 'mouse') {
    if (pointerLocked()) {
      if (e.button === 0) input.shoot = true;
      else if (e.button === 2) input.melee = true;
      else if (e.button === 1) input.special = true;
    } else if (e.button === 0) {
      pointers.set(e.pointerId, { mode: 'look', x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    } else if (e.button === 2) {
      input.melee = true;
    } else if (e.button === 1) {
      input.special = true;
    }
    return;
  }
  // 觸控：左側為移動搖桿，其餘區域轉動視角
  const leftZone = e.clientX < window.innerWidth * 0.45 && e.clientY > window.innerHeight * 0.2;
  if (leftZone && joyId === null) {
    joyId = e.pointerId;
    pointers.set(e.pointerId, { mode: 'joy', ox: e.clientX, oy: e.clientY });
    showJoy(e.clientX, e.clientY);
    moveJoy(0, 0);
  } else {
    pointers.set(e.pointerId, { mode: 'look', x: e.clientX, y: e.clientY });
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
});

window.addEventListener('pointermove', (e) => {
  if (!game || !battleActive()) return;
  const p = pointers.get(e.pointerId);
  if (e.pointerType === 'mouse' && pointerLocked()) {
    addLook(e.movementX, e.movementY, S_MOUSE);
    return;
  }
  if (!p) return;
  if (p.mode === 'look') {
    addLook(e.clientX - p.x, e.clientY - p.y, S_TOUCH);
    p.x = e.clientX;
    p.y = e.clientY;
  } else if (p.mode === 'joy') {
    moveJoy(e.clientX - p.ox, e.clientY - p.oy);
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (p.mode === 'joy') {
    joyId = null;
    joyMove.x = 0; joyMove.z = 0;
    applyMove();
    hideJoy();
  }
  if (e.pointerType === 'mouse') {
    if (e.button === 0) input.shoot = false;
    else if (e.button === 2) input.melee = false;
    else if (e.button === 1) input.special = false;
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

// 點畫面鎖定游標（桌機滑鼠）
canvas.addEventListener('click', (e) => {
  if (!battleActive() || pointerLocked() || !mousePrimary) return;
  if (canvas.requestPointerLock) {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { /* noop */ });
  }
  void e;
});
screenBattle.addEventListener('contextmenu', (e) => { if (battleActive()) e.preventDefault(); });

/* ================= 鍵盤 ================= */
const keyDown = {};
const dirKeys = {
  w: ['z', 1], W: ['z', 1], ArrowUp: ['z', 1],
  s: ['z', -1], S: ['z', -1], ArrowDown: ['z', -1],
  a: ['x', -1], A: ['x', -1], ArrowLeft: ['x', -1],
  d: ['x', 1], D: ['x', 1], ArrowRight: ['x', 1],
};
const actKeys = {
  ' ': 'jump', Shift: 'dash',
  j: 'shoot', J: 'shoot', k: 'melee', K: 'melee',
  l: 'special', L: 'special', q: 'special', Q: 'special',
};

function syncKeyMove() {
  keyMove.x = 0;
  keyMove.z = 0;
  for (const k in dirKeys) {
    if (keyDown[k]) {
      const [axis, v] = dirKeys[k];
      if (axis === 'x') keyMove.x = v;
      else keyMove.z = v;
    }
  }
  applyMove();
}

window.addEventListener('keydown', (e) => {
  if (!battleActive()) return;
  if (e.repeat) return;
  const a = actKeys[e.key];
  const dir = dirKeys[e.key];
  if (!a && !dir) return;
  e.preventDefault();
  unlock();
  if (dir) {
    keyDown[e.key] = true;
    syncKeyMove();
    return;
  }
  if (a === 'jump') input.jumpBuf = 0.16;
  else if (a === 'dash') input.dashBuf = 0.16;
  else input[a] = true;
});

window.addEventListener('keyup', (e) => {
  if (dirKeys[e.key]) {
    keyDown[e.key] = false;
    syncKeyMove();
    return;
  }
  const a = actKeys[e.key];
  if (a && a !== 'jump' && a !== 'dash') input[a] = false;
});

window.addEventListener('blur', () => {
  Object.assign(input, makeInput());
  for (const k in keyDown) keyDown[k] = false;
  syncKeyMove();
  input.shoot = false; input.melee = false; input.special = false;
});

/* ================= 觸控按鈕 ================= */
document.querySelectorAll('.tbtn').forEach((btn) => {
  const key = btn.dataset.key;
  const down = (e) => {
    e.preventDefault();
    unlock();
    btn.classList.add('on');
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    if (key === 'jump') input.jumpBuf = 0.16;
    else if (key === 'dash') input.dashBuf = 0.16;
    else input[key] = true;
  };
  const up = (e) => {
    e.preventDefault();
    btn.classList.remove('on');
    if (key !== 'jump' && key !== 'dash') input[key] = false;
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// 手機上第一次碰觸即顯示虛擬按鈕
screenBattle.addEventListener('pointerdown', () => {
  if (hasTouch) touchUI.classList.remove('hidden');
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!game) return;
  if (document.hidden) game.stop();
  else { game.last = performance.now(); game.start(); }
});

/* ================= 啟動 ================= */
buildGrid();
buildEnemyOptions();
previewRaf = requestAnimationFrame(previewLoop);
