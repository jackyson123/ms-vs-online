// 音效：極簡 WebAudio 合成，不需任何素材檔
let ctxA = null;
let master = null;
let noiseBuf = null;
let muted = false;
let ready = false;

function ensure() {
  if (ctxA) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctxA = new AC();
  master = ctxA.createGain();
  master.gain.value = 0.5;
  master.connect(ctxA.destination);
  const len = Math.floor(ctxA.sampleRate * 0.6);
  noiseBuf = ctxA.createBuffer(1, len, ctxA.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  ready = true;
  return true;
}

export function unlock() {
  if (!ensure()) return;
  if (ctxA.state === 'suspended') ctxA.resume();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}
export const isMuted = () => muted;

function tone({ type = 'square', from = 800, to = 200, dur = 0.1, vol = 0.25, delay = 0 }) {
  if (!ready || muted) return;
  const t0 = ctxA.currentTime + delay;
  const o = ctxA.createOscillator();
  const g = ctxA.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'lowpass' }) {
  if (!ready || muted) return;
  const t0 = ctxA.currentTime + delay;
  const s = ctxA.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctxA.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t0 + dur);
  f.Q.value = q;
  const g = ctxA.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

export const sfx = {
  shoot() { tone({ type: 'square', from: 1500, to: 340, dur: 0.09, vol: 0.16 }); noise({ dur: 0.06, vol: 0.07, freq: 3200, type: 'highpass' }); },
  heavy() { tone({ type: 'sawtooth', from: 620, to: 90, dur: 0.2, vol: 0.22 }); noise({ dur: 0.18, vol: 0.16, freq: 1400 }); },
  melee() { noise({ dur: 0.16, vol: 0.2, freq: 900, q: 6, type: 'bandpass' }); tone({ type: 'sawtooth', from: 1800, to: 700, dur: 0.14, vol: 0.1 }); },
  hit() { noise({ dur: 0.14, vol: 0.3, freq: 800 }); tone({ type: 'square', from: 260, to: 70, dur: 0.12, vol: 0.16 }); },
  hurt() { tone({ type: 'sawtooth', from: 420, to: 110, dur: 0.18, vol: 0.14 }); },
  jump() { tone({ type: 'sine', from: 320, to: 760, dur: 0.12, vol: 0.12 }); },
  dash() { noise({ dur: 0.2, vol: 0.14, freq: 2600, type: 'highpass' }); },
  special() { [0, 0.09, 0.18, 0.27].forEach((d, i) => tone({ type: 'square', from: 500 + i * 320, to: 1400 + i * 300, dur: 0.16, vol: 0.14, delay: d })); },
  beam() { tone({ type: 'sawtooth', from: 220, to: 1600, dur: 0.34, vol: 0.15 }); noise({ dur: 0.3, vol: 0.12, freq: 2400, type: 'bandpass' }); },
  explode() { noise({ dur: 0.55, vol: 0.4, freq: 900 }); tone({ type: 'triangle', from: 240, to: 45, dur: 0.5, vol: 0.2 }); },
  ko() { noise({ dur: 0.9, vol: 0.45, freq: 1400 }); tone({ type: 'sawtooth', from: 380, to: 50, dur: 0.9, vol: 0.22 }); },
  ui() { tone({ type: 'square', from: 900, to: 1400, dur: 0.06, vol: 0.1 }); },
  select() { tone({ type: 'square', from: 700, to: 1100, dur: 0.08, vol: 0.12 }); },
};
