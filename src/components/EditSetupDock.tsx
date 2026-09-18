import React from 'react';
import { 
  Sliders, Disc, Grid, Columns, Move, X, RefreshCw, 
  Sparkles, Check, CheckCircle2 
} from 'lucide-react';
import { 
  BentoLayoutConfig, 
  BentoArchetype, 
  JogWheelMode, 
  PadsMode, 
  MixerWidthMode, 
  BENTO_PRESETS, 
  playSpringChirp 
} from '../lib/BentoSpringEngine';

interface EditSetupDockProps {
  isOpen: boolean;
  onClose: () => void;
  config: BentoLayoutConfig;
  onChangeConfig: (newConfig: BentoLayoutConfig) => void;
}

export function EditSetupDock({ isOpen, onClose, config, onChangeConfig }: EditSetupDockProps) {
  if (!isOpen) return null;

  const handleSelectArchetype = (archetype: BentoArchetype) => {
    playSpringChirp();
    const preset = BENTO_PRESETS[archetype];
    onChangeConfig({ ...config, ...preset });
  };

  const handleUpdate = (partial: Partial<BentoLayoutConfig>) => {
    playSpringChirp();
    onChangeConfig({ ...config, ...partial });
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-6 duration-300">
      <div 
        className="bg-[#121218]/95 border border-[#00f2ff]/40 rounded-3xl p-4 md:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_35px_rgba(0,242,255,0.2)] backdrop-blur-2xl text-white flex flex-col gap-4 relative"
      >
        {/* Top bar: Title and Archetype Presets */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00f2ff] animate-pulse shadow-[0_0_8px_#00f2ff]" />
            <span className="text-xs font-mono font-black tracking-widest text-[#00f2ff] uppercase">
              BENTO EDIT SETUP
            </span>
          </div>

          {/* Archetype Quick Tabs */}
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <button
              onClick={() => handleSelectArchetype('live')}
              className={`px-2.5 py-1 rounded-lg border transition-all font-bold ${
                config.archetype === 'live' && config.jogMode === 'backseat'
                  ? 'bg-[#00f2ff]/25 border-[#00f2ff] text-[#00f2ff] shadow-[0_0_10px_rgba(0,242,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
              title="Jog wheels take a back seat, 8 Hot Cues, studio mixer"
            >
              🚀 Live Remix
            </button>
            <button
              onClick={() => handleSelectArchetype('club')}
              className={`px-2.5 py-1 rounded-lg border transition-all font-bold ${
                config.archetype === 'club' && config.jogMode === 'standard'
                  ? 'bg-amber-400/25 border-amber-400 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
              title="Standard CDJ + DJM club layout"
            >
              🎛️ Club Pro
            </button>
            <button
              onClick={() => handleSelectArchetype('minimal')}
              className={`px-2.5 py-1 rounded-lg border transition-all font-bold ${
                config.archetype === 'minimal'
                  ? 'bg-purple-500/25 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
              title="Ultra-compact ribbon jog, 8 cues, clean faders"
            >
              ⚡ Minimal
            </button>
            <button
              onClick={() => handleSelectArchetype('turntable')}
              className={`px-2.5 py-1 rounded-lg border transition-all font-bold ${
                config.archetype === 'turntable'
                  ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
              title="Classic vinyl scratch turntables"
            >
              🪩 Turntable
            </button>
          </div>

          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quantized Modular Adjusters (Uniform & Non-Chaotic) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* 1. Jog Wheel Tier */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white/80">
              <span className="flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5 text-[#00f2ff]" />
                JOG WHEEL
              </span>
              <span className="text-white/40 uppercase">{config.jogMode}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
              <button
                onClick={() => handleUpdate({ jogMode: 'backseat', archetype: 'live' })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.jogMode === 'backseat'
                    ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-[#00f2ff]'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
                title="90px low-profile cassette disc (recommended)"
              >
                Backseat
              </button>
              <button
                onClick={() => handleUpdate({ jogMode: 'minimal', archetype: 'minimal' })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.jogMode === 'minimal'
                    ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-[#00f2ff]'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
                title="60px mini disc ribbon"
              >
                Minimal
              </button>
              <button
                onClick={() => handleUpdate({ jogMode: 'classic', archetype: 'turntable' })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.jogMode === 'classic'
                    ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-[#00f2ff]'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
                title="210px full turntable platter"
              >
                Classic
              </button>
            </div>
          </div>

          {/* 2. Performance Pads Tier */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white/80">
              <span className="flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-emerald-400" />
                HOT CUE PADS
              </span>
              <span className="text-white/40">{config.padsMode} PADS</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
              <button
                onClick={() => handleUpdate({ padsMode: 4 })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.padsMode === 4
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
              >
                4 Pads (Row)
              </button>
              <button
                onClick={() => handleUpdate({ padsMode: 8 })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.padsMode === 8
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
                title="8-pad dual row matrix (2x4)"
              >
                8 Pads (Matrix)
              </button>
            </div>
          </div>

          {/* 3. Mixer Width Tier */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white/80">
              <span className="flex items-center gap-1.5">
                <Columns className="w-3.5 h-3.5 text-amber-400" />
                MIXER WIDTH
              </span>
              <span className="text-white/40">{config.mixerWidth}px</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
              <button
                onClick={() => handleUpdate({ mixerWidth: 260 })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.mixerWidth === 260
                    ? 'bg-amber-400/20 border-amber-400 text-amber-400'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
              >
                Slim
              </button>
              <button
                onClick={() => handleUpdate({ mixerWidth: 300 })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.mixerWidth === 300
                    ? 'bg-amber-400/20 border-amber-400 text-amber-400'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => handleUpdate({ mixerWidth: 350 })}
                className={`py-1.5 rounded border transition-all font-bold ${
                  config.mixerWidth === 350
                    ? 'bg-amber-400/20 border-amber-400 text-amber-400'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
              >
                Studio
              </button>
            </div>
          </div>

        </div>

        {/* Footer: Reset & Lock */}
        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-white/40">
          <button
            onClick={() => handleSelectArchetype('live')}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset to Live Preset</span>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition-all font-bold flex items-center gap-1.5"
          >
            <Check className="w-3 h-3 text-[#00f2ff]" />
            <span>Done Editing</span>
          </button>
        </div>

      </div>
    </div>
  );
}
