import type { SlotVerdict } from '../shared/index.js';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    try {
      const p = audioCtx.resume();
      if (p && typeof p.catch === 'function') {
        void p.catch(() => {});
      }
    } catch {
      // Ignore autoplay lock until user gesture unlocks audio.
    }
  }
  return audioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  opts: {
    freqStart: number;
    freqEnd?: number;
    type: OscillatorType;
    gainPeak: number;
    durationSec: number;
    delaySec?: number;
  },
): void {
  const start = ctx.currentTime + (opts.delaySec ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freqStart, start);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), start + opts.durationSec);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(opts.gainPeak, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + opts.durationSec + 0.02);
}

/**
 * Synthesizes a subtle, crisp mechanical keycap click (tactile switch snap + low thock).
 * Pure Web Audio API with zero external assets and safe autoplay guards.
 */
export function playKeyClick(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // High transient switch snap
  scheduleTone(ctx, {
    freqStart: 1320,
    freqEnd: 380,
    type: 'triangle',
    gainPeak: 0.045,
    durationSec: 0.028,
  });
  // Warm damped keycap bottom-out thock
  scheduleTone(ctx, {
    freqStart: 210,
    freqEnd: 95,
    type: 'sine',
    gainPeak: 0.055,
    durationSec: 0.042,
    delaySec: 0.006,
  });
}

/**
 * Confirmation chime when toggling sound ON via the top-bar mute/sound button.
 */
export function playToggleChime(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, {
    freqStart: 660,
    type: 'triangle',
    gainPeak: 0.05,
    durationSec: 0.075,
  });
  scheduleTone(ctx, {
    freqStart: 990,
    type: 'sine',
    gainPeak: 0.055,
    durationSec: 0.11,
    delaySec: 0.055,
  });
}

/**
 * Staggered mechanical forge-lock feedback for the 4 graded thread slots.
 */
export function playAttemptFeedback(enabled: boolean, verdicts: SlotVerdict[]): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const exactScale = [523.25, 659.25, 783.99, 1046.5];

  verdicts.forEach((verdict, idx) => {
    const delaySec = idx * 0.095;
    if (verdict === 'exact') {
      // Crisp anvil lock ping + resonant harmonic
      scheduleTone(ctx, {
        freqStart: exactScale[idx] ?? 783.99,
        type: 'triangle',
        gainPeak: 0.07,
        durationSec: 0.14,
        delaySec,
      });
      scheduleTone(ctx, {
        freqStart: (exactScale[idx] ?? 783.99) * 1.5,
        type: 'sine',
        gainPeak: 0.032,
        durationSec: 0.11,
        delaySec: delaySec + 0.015,
      });
    } else if (verdict === 'misplaced') {
      scheduleTone(ctx, {
        freqStart: 392,
        freqEnd: 330,
        type: 'triangle',
        gainPeak: 0.055,
        durationSec: 0.12,
        delaySec,
      });
    } else {
      scheduleTone(ctx, {
        freqStart: 175,
        freqEnd: 105,
        type: 'sawtooth',
        gainPeak: 0.036,
        durationSec: 0.11,
        delaySec,
      });
    }
  });
}

export function playVictoryChord(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const notes = [392.0, 493.88, 587.33, 783.99];
  notes.forEach((freq, idx) => {
    scheduleTone(ctx, {
      freqStart: freq,
      type: 'triangle',
      gainPeak: 0.068,
      durationSec: 0.34,
      delaySec: 0.32 + idx * 0.08,
    });
  });
}
