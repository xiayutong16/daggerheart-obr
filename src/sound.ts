// Tiny WebAudio synth for roll SFX — no audio files, so the build stays single-file.
// The mute switch is persisted so a table can keep it off between sessions.

const KEY = 'dh_sound_on';

let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== '0';
} catch {
  /* storage blocked */
}

let ctx: AudioContext | null = null;

export function isSoundOn(): boolean {
  return enabled;
}

export function setSoundOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function toggleSound(): boolean {
  setSoundOn(!enabled);
  if (enabled) playSfx('click');
  return enabled;
}

/** Lazily create / resume the context (browsers only allow this after a gesture). */
function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  opts: {
    freq: number;
    to?: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    at?: number;
  },
) {
  const t0 = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
  const peak = opts.gain ?? 0.12;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.03);
}

function noise(ac: AudioContext, opts: { dur: number; gain?: number; at?: number; from?: number; to?: number }) {
  const t0 = ac.currentTime + (opts.at ?? 0);
  const len = Math.max(1, Math.floor(ac.sampleRate * opts.dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(opts.from ?? 1200, t0);
  filter.frequency.exponentialRampToValueAtTime(opts.to ?? 2600, t0 + opts.dur);
  filter.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.09, t0);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + opts.dur);
}

export type Sfx = 'click' | 'tumble' | 'bounce' | 'hope' | 'fear' | 'doubles' | 'nat20' | 'nat1';

export function playSfx(name: Sfx) {
  const ac = audio();
  if (!ac) return;
  switch (name) {
    case 'click':
      tone(ac, { freq: 620, to: 420, dur: 0.06, type: 'square', gain: 0.05 });
      break;
    case 'tumble':
      // rattle of dice knocking together
      noise(ac, { dur: 0.34, gain: 0.075, from: 900, to: 2200 });
      for (let i = 0; i < 5; i++) {
        tone(ac, {
          freq: 180 + Math.random() * 260,
          dur: 0.05,
          type: 'square',
          gain: 0.035,
          at: 0.03 + i * 0.055,
        });
      }
      break;
    case 'bounce':
      tone(ac, { freq: 150, to: 90, dur: 0.08, type: 'sine', gain: 0.09 });
      noise(ac, { dur: 0.05, gain: 0.03, from: 1800, to: 700 });
      break;
    case 'hope':
      // bright rising major third, then a sparkle
      tone(ac, { freq: 660, dur: 0.22, type: 'triangle', gain: 0.10 });
      tone(ac, { freq: 990, dur: 0.3, type: 'triangle', gain: 0.085, at: 0.09 });
      tone(ac, { freq: 1320, dur: 0.36, type: 'sine', gain: 0.05, at: 0.17 });
      break;
    case 'fear':
      // low minor, sinking — a warning rather than a jingle
      tone(ac, { freq: 220, to: 160, dur: 0.42, type: 'sawtooth', gain: 0.07 });
      tone(ac, { freq: 311, to: 233, dur: 0.5, type: 'triangle', gain: 0.055, at: 0.04 });
      noise(ac, { dur: 0.26, gain: 0.035, from: 320, to: 140, at: 0.02 });
      break;
    case 'nat20':
      // 大成功：清脆的高频三连击 + 金属泛音，短促上扬
      tone(ac, { freq: 1568, dur: 0.15, type: 'triangle', gain: 0.115 });
      tone(ac, { freq: 2093, dur: 0.2, type: 'triangle', gain: 0.095, at: 0.055 });
      tone(ac, { freq: 2637, dur: 0.42, type: 'sine', gain: 0.08, at: 0.11 });
      tone(ac, { freq: 3136, dur: 0.5, type: 'sine', gain: 0.045, at: 0.15 });
      noise(ac, { dur: 0.2, gain: 0.035, from: 5200, to: 9200, at: 0.02 });
      break;
    case 'nat1':
      // 大失败：沉闷的闷响，低频往下坠，没有一点亮色
      tone(ac, { freq: 132, to: 44, dur: 0.6, type: 'sine', gain: 0.15 });
      tone(ac, { freq: 92, to: 38, dur: 0.72, type: 'triangle', gain: 0.095, at: 0.02 });
      tone(ac, { freq: 61, to: 32, dur: 0.8, type: 'sine', gain: 0.06, at: 0.05 });
      noise(ac, { dur: 0.5, gain: 0.05, from: 240, to: 70, at: 0.01 });
      break;
    case 'doubles':
      // 双数共鸣：一记钟声 + 上行的金色琶音，和普通结果完全区分开
      tone(ac, { freq: 523.25, dur: 0.55, type: 'sine', gain: 0.1 });
      tone(ac, { freq: 783.99, dur: 0.5, type: 'sine', gain: 0.07, at: 0.02 });
      tone(ac, { freq: 1567.98, dur: 0.6, type: 'sine', gain: 0.04, at: 0.03 });
      [659.25, 880, 1046.5, 1318.5].forEach((f, i) =>
        tone(ac, { freq: f, dur: 0.26, type: 'triangle', gain: 0.062, at: 0.13 + i * 0.062 }),
      );
      noise(ac, { dur: 0.62, gain: 0.03, from: 3200, to: 7000, at: 0.1 });
      break;
  }
}
