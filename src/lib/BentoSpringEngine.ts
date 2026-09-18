// ========================================================
// BENTO SPRING ENGINE: SECOND-ORDER SPRING SOLVER & LAYOUT CONFIG
// Inspired by Dynamic Morphing Bento Island (F = -kx - cv)
// ========================================================

export type JogWheelMode = 'backseat' | 'minimal' | 'standard' | 'classic' | 'hidden';
export type PadsMode = 4 | 8;
export type MixerWidthMode = 260 | 300 | 350;
export type PitchThrowMode = 'standard' | 'tall';
export type BentoArchetype = 'live' | 'club' | 'minimal' | 'turntable';

export interface BentoLayoutConfig {
  archetype: BentoArchetype;
  jogMode: JogWheelMode;
  padsMode: PadsMode;
  mixerWidth: MixerWidthMode;
  pitchThrow: PitchThrowMode;
  globalScale: number;
}

export const BENTO_PRESETS: Record<BentoArchetype, BentoLayoutConfig> = {
  // 1. LIVE REMIX: Jog wheel takes a back seat (90px), 8-pad cue matrix, wide studio mixer
  live: {
    archetype: 'live',
    jogMode: 'backseat',
    padsMode: 8,
    mixerWidth: 300,
    pitchThrow: 'tall',
    globalScale: 1.0,
  },
  // 2. CLUB PRO: Balanced CDJ layout with standard jog wheel, 4 hot cues, balanced mixer
  club: {
    archetype: 'club',
    jogMode: 'standard',
    padsMode: 4,
    mixerWidth: 300,
    pitchThrow: 'standard',
    globalScale: 1.0,
  },
  // 3. MINIMAL STRIP: Ultra-compact ribbon jog, 8 hot cues, clean studio strip
  minimal: {
    archetype: 'minimal',
    jogMode: 'minimal',
    padsMode: 8,
    mixerWidth: 260,
    pitchThrow: 'tall',
    globalScale: 1.0,
  },
  // 4. TURNTABLE CLASSIC: Full large vinyl platter for scratch enthusiasts
  turntable: {
    archetype: 'turntable',
    jogMode: 'classic',
    padsMode: 4,
    mixerWidth: 260,
    pitchThrow: 'standard',
    globalScale: 1.0,
  },
};

const STORAGE_KEY = 'lucid_decks_bento_setup';

export function loadBentoConfig(): BentoLayoutConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.jogMode && parsed.padsMode) {
        return { ...BENTO_PRESETS.live, ...parsed };
      }
    }
  } catch {}
  return { ...BENTO_PRESETS.live };
}

export function saveBentoConfig(config: BentoLayoutConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

// ----------------------------------------------------
// Zero-Dependency Procedural Audio Click (Synthesized)
// ----------------------------------------------------
let chirpCtx: AudioContext | null = null;
export function playSpringChirp() {
  try {
    if (!chirpCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) chirpCtx = new AudioCtxClass();
    }
    if (chirpCtx && chirpCtx.state === 'suspended') {
      chirpCtx.resume();
    }
    if (!chirpCtx) return;

    const now = chirpCtx.currentTime;
    const osc = chirpCtx.createOscillator();
    const gain = chirpCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.06);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(chirpCtx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {}
}

// Second-order spring physics helper for continuous properties
export class SpringScalar {
  current: number;
  target: number;
  velocity: number = 0;
  stiffness: number;
  damping: number;

  constructor(initial: number, stiffness = 0.14, damping = 0.75) {
    this.current = initial;
    this.target = initial;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  setTarget(val: number) {
    this.target = val;
  }

  step(): number {
    const force = (this.target - this.current) * this.stiffness;
    this.velocity = (this.velocity + force) * this.damping;
    this.current += this.velocity;
    return this.current;
  }

  isSettled(tolerance = 0.1): boolean {
    return Math.abs(this.target - this.current) < tolerance && Math.abs(this.velocity) < tolerance;
  }
}
