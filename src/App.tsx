import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { 
  Play, Pause, Repeat, 
  Music, FileAudio, Wrench, RefreshCw, ZoomIn, Move, Headphones, Volume2, Split, FolderOpen
} from 'lucide-react';
import { getAudioEngine, OutputRoutingMode } from './lib/AudioEngine';
import { initTraktorMIDI, TRAKTOR_S2_MAP, setMidiLearnTarget } from './lib/TraktorMIDI';
import { updateTrackHotCuesInDB } from './lib/LibraryDB';
import { MediaBrowser } from './components/MediaBrowser';
import { AILab } from './components/AILab';
import { BackgroundVisualizer, BgVisualizerMode } from './components/BackgroundVisualizer';

export const MidiLearnContext = React.createContext<{
  learnMode: boolean;
  activeTarget: string | null;
  setActiveTarget: (key: string) => void;
}>({ learnMode: false, activeTarget: null, setActiveTarget: () => {} });

export function MidiControl({ midiKey, children }: { midiKey: string, children: React.ReactElement, key?: React.Key }) {
  const { learnMode, activeTarget, setActiveTarget } = React.useContext(MidiLearnContext);
  const isActive = activeTarget === midiKey;

  const isDeckA = midiKey.includes('DECK_A');
  const isDeckB = midiKey.includes('DECK_B');
  const theme = isDeckA ? '#00f2ff' : isDeckB ? '#ff0055' : '#ffffff';
  
  const [isLinked, setIsLinked] = useState(false);
  useEffect(() => {
    const checkLink = () => {
      setIsLinked(typeof TRAKTOR_S2_MAP[midiKey] === 'string');
    };
    checkLink();
    window.addEventListener('dj-midi-learned', checkLink);
    return () => window.removeEventListener('dj-midi-learned', checkLink);
  }, [midiKey]);

  const child = React.Children.only(children);
  
  const baseClassName = child.props.className || '';
  const learnClassName = learnMode 
    ? `cursor-pointer hover:brightness-125 ${isActive ? 'ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] bg-emerald-400/20' : ''}` 
    : '';
  
  const isDOMElement = typeof child.type === 'string';
  const filterStyle = (!learnMode && isLinked) ? `drop-shadow(0 0 5px ${theme})` : undefined;

  return React.cloneElement(child, {
    className: `${baseClassName} ${learnClassName}`.trim(),
    style: {
      ...child.props.style,
      filter: (isDOMElement && filterStyle) ? `${filterStyle} ${child.props.style?.filter || ''}` : child.props.style?.filter,
    },
    'data-midi-linked': !learnMode && isLinked,
    'data-midi-theme': theme,
    onClickCapture: learnMode ? (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveTarget(midiKey);
      setMidiLearnTarget(midiKey);
    } : child.props.onClickCapture,
    onMouseDownCapture: learnMode ? (e: any) => { 
      e.stopPropagation(); 
      e.preventDefault(); 
    } : child.props.onMouseDownCapture,
  });
}

const HOT_CUE_COLORS = ['#00f2ff', '#10b981', '#f59e0b', '#ff0055'];

const WaveformSVG = ({ 
  peaks, color, progress, height = 100, className = '', direction = 'center', thickness = 'solid',
  hotCues = [], duration = 0, onHotCueClick, compact = false
}: { 
  peaks: number[], color: string, progress: number, height?: number, className?: string, direction?: 'center'|'up'|'down', thickness?: 'solid'|'thick'|'thin',
  hotCues?: (number | null)[], duration?: number, onHotCueClick?: (idx: number) => void, compact?: boolean
}) => {
  const idBase = React.useId().replace(/:/g, '');
  if (peaks.length === 0) return null;
  const width = 1000;
  const step = width / peaks.length;
  
  let pathD = '';
  
  if (thickness === 'solid') {
    if (direction === 'center') {
      pathD = `M 0,${height/2}`;
      peaks.forEach((p, i) => { pathD += ` L ${i*step},${(height/2) - (p * height/2)}`; });
      for(let i = peaks.length - 1; i >= 0; i--) { pathD += ` L ${i*step},${(height/2) + (peaks[i] * height/2)}`; }
      pathD += ` Z`;
    } else if (direction === 'up') {
      pathD = `M 0,${height}`;
      peaks.forEach((p, i) => { pathD += ` L ${i*step},${height - p * height}`; });
      pathD += ` L ${width},${height} Z`;
    } else if (direction === 'down') {
      pathD = `M 0,0`;
      peaks.forEach((p, i) => { pathD += ` L ${i*step},${p * height}`; });
      pathD += ` L ${width},0 Z`;
    }
  } else {
    peaks.forEach((p, i) => {
      const x = i * step;
      let y1, y2;
      if (direction === 'center') {
        y1 = (height/2) - (p * height/2);
        y2 = (height/2) + (p * height/2);
      } else if (direction === 'up') {
        y1 = height;
        y2 = height - (p * height);
      } else {
        y1 = 0;
        y2 = p * height;
      }
      pathD += `M ${x},${y1} L ${x},${y2} `;
    });
  }

  const clipId = `clip-${idBase}`;
  const clipFutureId = `clip-future-${idBase}`;
  const strokeWidth = thickness === 'thick' ? 4 : thickness === 'thin' ? 1.5 : 0;

  return (
    <div className="relative w-full h-full">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={`w-full h-full ${className}`}>
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={`${progress}%`} height="100%" />
          </clipPath>
          <clipPath id={clipFutureId}>
            <rect x={`${progress}%`} y="0" width={`${100 - progress}%`} height="100%" />
          </clipPath>
        </defs>
        {thickness === 'solid' ? (
          <>
            <path d={pathD} fill="rgba(255,255,255,0.2)" clipPath={`url(#${clipFutureId})`} />
            <path d={pathD} fill={color} clipPath={`url(#${clipId})`} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
          </>
        ) : (
          <>
            <path d={pathD} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={strokeWidth} strokeLinecap="round" clipPath={`url(#${clipFutureId})`} />
            <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" clipPath={`url(#${clipId})`} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
          </>
        )}
      </svg>

      {/* Hot Cue Marker Flags on Waveform */}
      {duration > 0 && hotCues.map((cue, idx) => {
        if (cue === null || cue === undefined) return null;
        const pct = Math.min(100, Math.max(0, (cue / duration) * 100));
        const padColor = HOT_CUE_COLORS[idx];
        return (
          <div 
            key={idx}
            className="absolute top-0 bottom-0 z-20 pointer-events-auto cursor-pointer group/cue -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${pct}%` }}
            onClick={(e) => {
              e.stopPropagation();
              onHotCueClick?.(idx);
            }}
            title={`Hot Cue ${idx + 1}: ${cue.toFixed(1)}s`}
          >
            <div 
              className={`${compact ? 'text-[7px] px-0.5' : 'text-[8px] px-1'} font-mono font-black rounded-t-sm text-black shadow-md transition-transform group-hover/cue:scale-125 leading-none`}
              style={{ backgroundColor: padColor, boxShadow: `0 0 8px ${padColor}` }}
            >
              {idx + 1}
            </div>
            <div className="w-[1.5px] flex-1 opacity-80" style={{ backgroundColor: padColor }} />
          </div>
        );
      })}
    </div>
  );
};

const OverlayedWaveforms = ({ 
  isPlayingA, isPlayingB, fileA, fileB, thickness, colorA, colorB, height,
  hotCuesA, hotCuesB, isCompact = false
}: { 
  isPlayingA: boolean, isPlayingB: boolean, fileA: File | null, fileB: File | null, 
  thickness: 'solid'|'thick'|'thin', colorA: string, colorB: string, height: number,
  hotCuesA: (number | null)[], hotCuesB: (number | null)[], isCompact?: boolean
}) => {
  const [progressA, setProgressA] = useState(0);
  const [progressB, setProgressB] = useState(0);
  const [durA, setDurA] = useState(0);
  const [durB, setDurB] = useState(0);
  const [peaksA, setPeaksA] = useState<number[]>([]);
  const [peaksB, setPeaksB] = useState<number[]>([]);
  const [activeDeck, setActiveDeck] = useState<'A'|'B'>('A');
  
  useEffect(() => {
    const engine = getAudioEngine();
    const interval = setInterval(() => {
      const dA = engine.deckA.duration;
      setDurA(dA);
      if (dA > 0) setProgressA((engine.deckA.currentTime / dA) * 100);
      if (engine.deckA.peaks !== peaksA) setPeaksA([...engine.deckA.peaks]);
      
      const dB = engine.deckB.duration;
      setDurB(dB);
      if (dB > 0) setProgressB((engine.deckB.currentTime / dB) * 100);
      if (engine.deckB.peaks !== peaksB) setPeaksB([...engine.deckB.peaks]);
    }, 40);
    return () => clearInterval(interval);
  }, [peaksA, peaksB]);

  const handleSeek = (e: React.MouseEvent, targetDeck: 'A'|'B') => {
    const engine = getAudioEngine();
    const target = targetDeck === 'A' ? engine.deckA : engine.deckB;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (target.duration > 0) {
      target.seek(pos * target.duration);
      if (targetDeck === 'A') setProgressA(pos * 100);
      else setProgressB(pos * 100);
    }
  };

  return (
    <div 
      className="w-full bg-black/80 border-b border-white/10 relative z-40 shadow-lg flex flex-col overflow-hidden group transition-[height] duration-300 ease-in-out" 
      style={{ height: `${height}px` }}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Top half seek A */}
        <div className="w-full h-1/2 z-20 cursor-pointer" onClick={(e) => handleSeek(e, 'A')} onMouseEnter={() => setActiveDeck('A')} />
        {/* Bottom half seek B */}
        <div className="w-full h-1/2 z-20 cursor-pointer" onClick={(e) => handleSeek(e, 'B')} onMouseEnter={() => setActiveDeck('B')} />
      </div>

      {/* Waveforms */}
      <div className="absolute top-0 left-0 right-0 h-1/2">
        <WaveformSVG 
          peaks={peaksA} 
          color={colorA} 
          progress={progressA} 
          direction="up" 
          thickness={thickness} 
          hotCues={hotCuesA}
          duration={durA}
          onHotCueClick={(idx) => getAudioEngine().deckA.jumpToHotCue(idx)}
          compact={isCompact}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1/2 border-t border-white/10">
        <WaveformSVG 
          peaks={peaksB} 
          color={colorB} 
          progress={progressB} 
          direction="down" 
          thickness={thickness} 
          hotCues={hotCuesB}
          duration={durB}
          onHotCueClick={(idx) => getAudioEngine().deckB.jumpToHotCue(idx)}
          compact={isCompact}
        />
      </div>

      {/* Playheads */}
      <div className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none" style={{ left: `${progressA}%`, backgroundColor: colorA, boxShadow: `0 0 10px ${colorA}` }} />
      <div className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none" style={{ left: `${progressB}%`, backgroundColor: colorB, boxShadow: `0 0 10px ${colorB}` }} />

      {/* Labels */}
      <div 
        className={`absolute left-2 z-30 font-mono font-bold transition-all truncate max-w-[45%] pointer-events-none ${
          isCompact ? 'top-0.5 text-[8px] leading-tight' : 'top-1 text-[10px]'
        }`} 
        style={{ color: colorA, opacity: activeDeck === 'A' ? 1 : 0.6 }}
      >
        DECK A {fileA ? `• ${fileA.name}` : ''}
      </div>
      <div 
        className={`absolute left-2 z-30 font-mono font-bold transition-all truncate max-w-[45%] pointer-events-none ${
          isCompact ? 'bottom-0.5 text-[8px] leading-tight' : 'bottom-1 text-[10px]'
        }`} 
        style={{ color: colorB, opacity: activeDeck === 'B' ? 1 : 0.6 }}
      >
        DECK B {fileB ? `• ${fileB.name}` : ''}
      </div>

      {/* Dual Phase Strip indicator in compact mode */}
      {isCompact && (
        <div className="absolute top-1/2 -translate-y-1/2 right-3 text-[8px] font-mono text-white/30 tracking-widest pointer-events-none hidden sm:block uppercase select-none">
          Dual Phase Strip
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [midiLearnMode, setMidiLearnMode] = useState(false);
  const [activeMidiTarget, setActiveMidiTarget] = useState<string | null>(null);
  const [, setMidiUpdateCount] = useState(0);
  
  const [libraryVisible, setLibraryVisible] = useState(true);
  const [waveformThickness, setWaveformThickness] = useState<'solid'|'thick'|'thin'>('solid');
  const [deckAColor, setDeckAColor] = useState('#00f2ff');
  const [deckBColor, setDeckBColor] = useState('#ff0055');
  const [waveformHeight, setWaveformHeight] = useState(112);

  // Top waveform visualizer sacrifices height when folder drawer is open to protect deck space
  const compactWaveformHeight = Math.min(48, Math.max(40, Math.round(waveformHeight * 0.43)));
  const effectiveWaveformHeight = libraryVisible ? compactWaveformHeight : waveformHeight;

  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiStatus, setMidiStatus] = useState<string>('Unchecked');
  const [deckAFile, setDeckAFile] = useState<File | null>(null);
  const [deckBFile, setDeckBFile] = useState<File | null>(null);

  // Deck Transport & Performance State
  const [deckAPlay, setDeckAPlay] = useState(false);
  const [deckBPlay, setDeckBPlay] = useState(false);
  const [deckALoop, setDeckALoop] = useState(false);
  const [deckBLoop, setDeckBLoop] = useState(false);
  const [deckAKeylock, setDeckAKeylock] = useState(false);
  const [deckBKeylock, setDeckBKeylock] = useState(false);
  const [deckAHotCues, setDeckAHotCues] = useState<(number | null)[]>([null, null, null, null]);
  const [deckBHotCues, setDeckBHotCues] = useState<(number | null)[]>([null, null, null, null]);
  
  // Mixer & Headphone PFL State
  const [crossfader, setCrossfader] = useState(0.5);
  const [masterVol, setMasterVol] = useState(0.8);
  const [deckAVol, setDeckAVol] = useState(0.8);
  const [deckBVol, setDeckBVol] = useState(0.8);
  const [cueAActive, setCueAActive] = useState(false);
  const [cueBActive, setCueBActive] = useState(false);
  const [cueVol, setCueVol] = useState(0.8);
  const [cueMix, setCueMix] = useState(0.0);
  const [outputMode, setOutputMode] = useState<OutputRoutingMode>('stereo-sum');

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Tools / Settings State
  const [toolsOpen, setToolsOpen] = useState(false);
  const [aiLabOpen, setAiLabOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [bgVisMode, setBgVisMode] = useState<BgVisualizerMode>('aura');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setLibraryVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleLearned = () => {
      setActiveMidiTarget(null);
      setMidiUpdateCount(c => c + 1);
    };
    window.addEventListener('dj-midi-learned', handleLearned);
    return () => window.removeEventListener('dj-midi-learned', handleLearned);
  }, []);

  useEffect(() => {
    const resumeAudio = () => {
      getAudioEngine().resume();
      window.removeEventListener('click', resumeAudio);
    };
    window.addEventListener('click', resumeAudio);
    return () => window.removeEventListener('click', resumeAudio);
  }, []);

  useEffect(() => {
    if (midiEnabled) {
      initTraktorMIDI();
      checkMidiDevices();
    }
  }, [midiEnabled]);

  const checkMidiDevices = async () => {
    if (navigator.requestMIDIAccess) {
      try {
        const access = await navigator.requestMIDIAccess();
        const inputs = Array.from(access.inputs.values());
        if (inputs.length > 0) {
          setMidiStatus(`${inputs.length} Device(s) Connected: ${inputs.map(i => i.name).join(', ')}`);
        } else {
          setMidiStatus('No MIDI devices found.');
        }
      } catch (err) {
        setMidiStatus('MIDI Access Denied or Failed.');
      }
    } else {
      setMidiStatus('Web MIDI API not supported in this browser.');
    }
  };

  // Sync state with MIDI / audio engine events
  useEffect(() => {
    const handleMidiUpdate = (e: any) => {
      const { controlName, normalized } = e.detail;
      if (controlName === 'CROSSFADER') setCrossfader(normalized);
      if (controlName === 'MASTER_VOLUME') setMasterVol(normalized);
      if (controlName === 'DECK_A_VOLUME') setDeckAVol(normalized);
      if (controlName === 'DECK_B_VOLUME') setDeckBVol(normalized);
      if (controlName === 'HEADPHONE_VOLUME') setCueVol(normalized);
      if (controlName === 'CUE_MIX') setCueMix(normalized);

      const engine = getAudioEngine();
      setDeckAPlay(engine.deckA.isPlaying);
      setDeckBPlay(engine.deckB.isPlaying);
      setDeckALoop(engine.deckA.loopEnabled);
      setDeckBLoop(engine.deckB.loopEnabled);
      setDeckAKeylock(engine.deckA.keylock);
      setDeckBKeylock(engine.deckB.keylock);
      setCueAActive(engine.deckA.isCueActive);
      setCueBActive(engine.deckB.isCueActive);
      setDeckAHotCues([...engine.deckA.hotCues]);
      setDeckBHotCues([...engine.deckB.hotCues]);
    };
    window.addEventListener('dj-control', handleMidiUpdate);
    return () => window.removeEventListener('dj-control', handleMidiUpdate);
  }, []);

  // Poll for transport status
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = getAudioEngine();
      if (deckAPlay !== engine.deckA.isPlaying) setDeckAPlay(engine.deckA.isPlaying);
      if (deckBPlay !== engine.deckB.isPlaying) setDeckBPlay(engine.deckB.isPlaying);
      if (deckALoop !== engine.deckA.loopEnabled) setDeckALoop(engine.deckA.loopEnabled);
      if (deckBLoop !== engine.deckB.loopEnabled) setDeckBLoop(engine.deckB.loopEnabled);
      if (deckAKeylock !== engine.deckA.keylock) setDeckAKeylock(engine.deckA.keylock);
      if (deckBKeylock !== engine.deckB.keylock) setDeckBKeylock(engine.deckB.keylock);
      if (cueAActive !== engine.deckA.isCueActive) setCueAActive(engine.deckA.isCueActive);
      if (cueBActive !== engine.deckB.isCueActive) setCueBActive(engine.deckB.isCueActive);
    }, 60);
    return () => clearInterval(interval);
  }, [deckAPlay, deckBPlay, deckALoop, deckBLoop, deckAKeylock, deckBKeylock, cueAActive, cueBActive]);

  const handleLoadDeck = async (deck: 'A' | 'B', file: File, trackId?: string, hotCues?: (number | null)[]) => {
    const engine = getAudioEngine();
    if (deck === 'A') {
      setDeckAFile(file);
      await engine.deckA.load(file, trackId, hotCues);
      engine.deckA.setVolume(deckAVol);
      setDeckAHotCues([...engine.deckA.hotCues]);
      setDeckAKeylock(engine.deckA.keylock);
    } else {
      setDeckBFile(file);
      await engine.deckB.load(file, trackId, hotCues);
      engine.deckB.setVolume(deckBVol);
      setDeckBHotCues([...engine.deckB.hotCues]);
      setDeckBKeylock(engine.deckB.keylock);
    }
  };

  const togglePlay = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
    engine.resume();
    const target = deck === 'A' ? engine.deckA : engine.deckB;
    if (target.isPlaying) target.pause();
    else target.play();
  };

  const toggleCue = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
    engine.resume();
    const target = deck === 'A' ? engine.deckA : engine.deckB;
    if (!target.isPlaying) target.setCuePoint();
    else target.jumpToCue();
  };

  const toggleLoop = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
    const target = deck === 'A' ? engine.deckA : engine.deckB;
    target.toggleLoop();
    if (deck === 'A') setDeckALoop(target.loopEnabled);
    else setDeckBLoop(target.loopEnabled);
  };

  const toggleKeylock = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
    const target = deck === 'A' ? engine.deckA : engine.deckB;
    target.setKeylock(!target.keylock);
    if (deck === 'A') setDeckAKeylock(target.keylock);
    else setDeckBKeylock(target.keylock);
  };

  const togglePflCue = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
    if (deck === 'A') {
      engine.toggleCueA();
      setCueAActive(engine.deckA.isCueActive);
    } else {
      engine.toggleCueB();
      setCueBActive(engine.deckB.isCueActive);
    }
  };

  const handleHotCueClick = (deck: 'A' | 'B', index: number, isDelMode: boolean) => {
    const engine = getAudioEngine();
    const target = deck === 'A' ? engine.deckA : engine.deckB;

    if (isDelMode) {
      target.clearHotCue(index);
    } else {
      target.jumpToHotCue(index);
    }

    const updated = [...target.hotCues];
    if (deck === 'A') setDeckAHotCues(updated);
    else setDeckBHotCues(updated);

    // Save to IndexedDB if track has an ID
    if (target.trackId) {
      updateTrackHotCuesInDB(target.trackId, updated);
    }
  };

  const handleRoutingModeChange = (mode: OutputRoutingMode) => {
    setOutputMode(mode);
    getAudioEngine().setupOutputRouting(mode);
  };

  const handleExportMidi = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(TRAKTOR_S2_MAP, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "midi-mapping.json");
    dlAnchorElem.click();
  };

  const handleImportMidi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          for (const key in TRAKTOR_S2_MAP) {
            delete TRAKTOR_S2_MAP[key];
          }
          Object.assign(TRAKTOR_S2_MAP, parsed);
          setMidiUpdateCount(c => c + 1);
        } catch (err) {
          console.error("Invalid MIDI mapping file");
        }
      };
      reader.readAsText(file);
    }
  };

  const resetCustomizer = () => {
    setScale(1);
    setRotation(0);
    setTranslateX(0);
    setTranslateY(0);
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0c] text-white flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-white/10 bg-black/40 flex items-center justify-between px-6 shrink-0 relative z-50">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-white/50" />
          <h1 className="font-bold tracking-widest text-sm uppercase">
            <span className="text-[#00f2ff]">LUCID</span> <span className="text-[#ff0055]">DECKS</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Output Mode Indicator Badge */}
          <div 
            onClick={() => setToolsOpen(true)}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30 cursor-pointer transition-colors"
            title="Click to configure audio output in Settings"
          >
            <Headphones className="w-3 h-3 text-amber-400" />
            <span className="text-white/60 uppercase">
              {outputMode === 'split-lr' ? 'SPLIT L/R' : outputMode === '4-channel' ? '4-CH AUDIO' : 'STEREO'}
            </span>
          </div>

          <label className="flex items-center gap-2 text-xs font-mono cursor-pointer border border-white/20 px-3 py-1.5 rounded transition-colors hover:bg-white/10">
            <input 
              type="checkbox" 
              checked={midiEnabled} 
              onChange={(e) => setMidiEnabled(e.target.checked)} 
              className="accent-[#00f2ff]"
            />
            <span className={midiEnabled ? 'text-[#00f2ff] font-bold' : 'text-white/70 hover:text-white'}>MIDI</span>
          </label>

          {midiEnabled && (
            <button 
              onClick={() => {
                const next = !midiLearnMode;
                setMidiLearnMode(next);
                if (!next) {
                  setActiveMidiTarget(null);
                  setMidiLearnTarget(null);
                }
              }}
              className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded border transition-colors ${midiLearnMode ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'border-white/20 hover:border-white/50 text-white/70 hover:text-white'}`}
            >
              {midiLearnMode && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              {midiLearnMode ? 'LEARNING...' : 'MAP MIDI'}
            </button>
          )}

          <div className="relative ml-4 flex gap-4">
            <button 
              onClick={() => setLibraryVisible(!libraryVisible)}
              className={`flex items-center gap-1.5 text-xs font-mono uppercase px-3 py-1.5 rounded border transition-colors ${
                libraryVisible 
                  ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-[#00f2ff]' 
                  : 'border-white/20 hover:border-white/50 text-white/70 hover:text-white'
              }`}
              title="Toggle Library Drawer (Space)"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Library</span>
              <span className="text-[9px] opacity-40 font-mono hidden lg:inline">[Space]</span>
            </button>
            <button 
              onClick={() => setAiLabOpen(!aiLabOpen)}
              className={`flex items-center gap-2 text-xs font-mono uppercase px-3 py-1.5 rounded border transition-colors ${aiLabOpen ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-[#00f2ff]' : 'border-white/20 hover:border-[#00f2ff]/50 text-[#00f2ff]/70 hover:text-[#00f2ff]'}`}
            >
              <Music className="w-4 h-4" />
              AI Lab
            </button>
            <button 
              onClick={() => setToolsOpen(!toolsOpen)}
              className={`flex items-center gap-2 text-xs font-mono uppercase px-3 py-1.5 rounded border transition-colors ${toolsOpen ? 'bg-white/10 border-white text-white' : 'border-white/20 hover:border-white/50 text-white/70 hover:text-white'}`}
            >
              <Wrench className="w-4 h-4" />
              Settings
            </button>

            {/* Settings Modal */}
            {toolsOpen && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-8 backdrop-blur-md">
                <div className="bg-[#1a1a20] border border-white/10 rounded-2xl p-8 max-w-5xl w-full max-h-full overflow-y-auto shadow-2xl flex flex-col gap-8 relative">
                  <button onClick={() => setToolsOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white text-xl">
                    ✕
                  </button>
                  <h2 className="text-xl font-bold tracking-widest border-b border-white/10 pb-4">SETTINGS</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    
                    {/* Column 1: Audio Output & Routing */}
                    <div className="flex flex-col gap-8">
                      <div>
                        <h3 className="text-xs font-bold tracking-widest text-[#00f2ff] mb-4 uppercase flex items-center gap-2">
                          <Headphones className="w-4 h-4" /> Audio Output Routing (PFL)
                        </h3>
                        <div className="flex flex-col gap-3">
                          <div className="text-[10px] font-mono opacity-60 bg-black/40 border border-white/5 p-2.5 rounded-lg">
                            Hardware: {getAudioEngine().maxChannels} Output Channels Detected
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => handleRoutingModeChange('stereo-sum')}
                              className={`text-left text-[11px] p-2.5 rounded-lg border transition-all ${outputMode === 'stereo-sum' ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-white font-bold shadow-[0_0_10px_rgba(0,242,255,0.2)]' : 'border-white/10 text-white/50 hover:text-white bg-black/20'}`}
                            >
                              <div className="font-bold">Stereo Sum / Preview</div>
                              <div className="text-[9px] opacity-60 font-mono mt-0.5">Master and Cue previewed together (Laptop speakers/headphones)</div>
                            </button>
                            
                            <button 
                              onClick={() => handleRoutingModeChange('split-lr')}
                              className={`text-left text-[11px] p-2.5 rounded-lg border transition-all ${outputMode === 'split-lr' ? 'bg-amber-400/20 border-amber-400 text-white font-bold shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 'border-white/10 text-white/50 hover:text-white bg-black/20'}`}
                            >
                              <div className="font-bold flex items-center gap-1.5">
                                <Split className="w-3 h-3 text-amber-400" /> Split Stereo Cable (L/R)
                              </div>
                              <div className="text-[9px] opacity-60 font-mono mt-0.5">Left = Master (Speakers) | Right = Cue (Headphones)</div>
                            </button>
                            
                            <button 
                              onClick={() => handleRoutingModeChange('4-channel')}
                              disabled={getAudioEngine().maxChannels < 4}
                              className={`text-left text-[11px] p-2.5 rounded-lg border transition-all ${outputMode === '4-channel' ? 'bg-emerald-400/20 border-emerald-400 text-white font-bold shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'border-white/10 text-white/50 hover:text-white bg-black/20 disabled:opacity-40'}`}
                            >
                              <div className="font-bold">4-Channel DJ Soundcard</div>
                              <div className="text-[9px] opacity-60 font-mono mt-0.5">
                                {getAudioEngine().maxChannels >= 4 
                                  ? 'Ch 1-2: Master Out | Ch 3-4: Headphone Cue' 
                                  : 'Requires 4-channel DJ soundcard/interface'}
                              </div>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-bold tracking-widest text-white/50 mb-4 uppercase">Waveforms</h3>
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-mono">Waveform Density</label>
                            <div className="flex gap-2">
                              <button onClick={() => setWaveformThickness('solid')} className={`flex-1 text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-colors ${waveformThickness === 'solid' ? 'bg-white/20 border-white text-white' : 'border-white/10 text-white/50 hover:text-white'}`}>Solid</button>
                              <button onClick={() => setWaveformThickness('thick')} className={`flex-1 text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-colors ${waveformThickness === 'thick' ? 'bg-white/20 border-white text-white' : 'border-white/10 text-white/50 hover:text-white'}`}>Bars</button>
                              <button onClick={() => setWaveformThickness('thin')} className={`flex-1 text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-colors ${waveformThickness === 'thin' ? 'bg-white/20 border-white text-white' : 'border-white/10 text-white/50 hover:text-white'}`}>Lines</button>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-mono">Global Waveform Height: {waveformHeight}px</label>
                            <input type="range" min="56" max="300" step="1" value={waveformHeight} onChange={(e) => setWaveformHeight(parseInt(e.target.value))} className="w-full accent-white" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Customise View & Colors */}
                    <div className="flex flex-col gap-8">
                      <div>
                        <h3 className="text-xs font-bold tracking-widest text-white/50 mb-4 uppercase">Customise View</h3>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-4 text-xs font-mono">
                            <ZoomIn className="w-4 h-4 opacity-50 shrink-0" /> <span className="w-24">Scale: {scale.toFixed(2)}x</span>
                            <input type="range" min="0.5" max="1.5" step="0.05" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="flex-1 accent-white" />
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono">
                            <RefreshCw className="w-4 h-4 opacity-50 shrink-0" /> <span className="w-24">Rotate: {rotation}°</span>
                            <input type="range" min="-45" max="45" step="1" value={rotation} onChange={(e) => setRotation(parseFloat(e.target.value))} className="flex-1 accent-white" />
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono">
                            <Move className="w-4 h-4 opacity-50 shrink-0" /> <span className="w-24">Pan X: {translateX}px</span>
                            <input type="range" min="-300" max="300" step="1" value={translateX} onChange={(e) => setTranslateX(parseFloat(e.target.value))} className="flex-1 accent-white" />
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono">
                            <Move className="w-4 h-4 opacity-50 shrink-0" /> <span className="w-24">Pan Y: {translateY}px</span>
                            <input type="range" min="-300" max="300" step="1" value={translateY} onChange={(e) => setTranslateY(parseFloat(e.target.value))} className="flex-1 accent-white" />
                          </div>
                          <button onClick={resetCustomizer} className="w-full text-[10px] tracking-wider uppercase py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors">
                            Reset View
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-bold tracking-widest text-white/50 mb-4 uppercase">Colors</h3>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-mono" style={{ color: deckAColor }}>Deck A Theme</label>
                            <input type="color" value={deckAColor} onChange={(e) => setDeckAColor(e.target.value)} className="w-12 h-8 bg-transparent border-0 cursor-pointer" />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-mono" style={{ color: deckBColor }}>Deck B Theme</label>
                            <input type="color" value={deckBColor} onChange={(e) => setDeckBColor(e.target.value)} className="w-12 h-8 bg-transparent border-0 cursor-pointer" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-bold tracking-widest text-[#00f2ff] mb-3 uppercase flex items-center gap-2">
                          <Music className="w-4 h-4" /> Background Visualizer
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => setBgVisMode('aura')} 
                            className={`text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-all ${bgVisMode === 'aura' ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-white font-bold shadow-[0_0_10px_rgba(0,242,255,0.3)]' : 'border-white/10 text-white/50 hover:text-white bg-black/20'}`}
                          >
                            Ambient Aura
                          </button>
                          <button 
                            onClick={() => setBgVisMode('horizon')} 
                            className={`text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-all ${bgVisMode === 'horizon' ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-white font-bold shadow-[0_0_10px_rgba(0,242,255,0.3)]' : 'border-white/10 text-white/50 hover:text-white bg-black/20'}`}
                          >
                            Horizon Wave
                          </button>
                          <button 
                            onClick={() => setBgVisMode('rings')} 
                            className={`text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-all ${bgVisMode === 'rings' ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-white font-bold shadow-[0_0_10px_rgba(0,242,255,0.3)]' : 'border-white/10 text-white/50 hover:text-white bg-black/20'}`}
                          >
                            Soundwave Rings
                          </button>
                          <button 
                            onClick={() => setBgVisMode('off')} 
                            className={`text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-all ${bgVisMode === 'off' ? 'bg-white/20 border-white text-white font-bold' : 'border-white/10 text-white/50 hover:text-white bg-black/20'}`}
                          >
                            Disabled
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: MIDI Database */}
                    <div className="flex flex-col gap-4 h-[500px]">
                      <h3 className="text-xs font-bold tracking-widest text-white/50 uppercase">MIDI Database</h3>
                      <div className="text-[10px] font-mono opacity-50 bg-white/5 p-2 rounded">Status: {midiStatus}</div>
                      <div className="flex-1 bg-black/20 border border-white/10 rounded overflow-y-auto p-2">
                        {Object.entries(TRAKTOR_S2_MAP).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                            <span className="text-[10px] font-mono opacity-80 truncate mr-2" title={key}>{key}</span>
                            <span className="text-[10px] font-mono font-bold bg-white/10 px-1 rounded shrink-0">
                              {typeof value === 'number' ? `0x${value.toString(16).toUpperCase()}` : value}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={handleExportMidi}
                          className="flex-1 text-[10px] tracking-wider uppercase py-2 border border-white/20 hover:border-white text-white rounded transition-colors"
                        >
                          Export
                        </button>
                        <label className="flex-1 text-[10px] tracking-wider uppercase py-2 border border-white/20 hover:border-white text-white rounded transition-colors text-center cursor-pointer">
                          Import
                          <input type="file" className="hidden" accept=".json" onChange={handleImportMidi} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {/* Global Track Progress & Dual Waveforms with Hot Cues */}
      <div className="flex w-full shrink-0">
        <OverlayedWaveforms 
          isPlayingA={deckAPlay} 
          isPlayingB={deckBPlay} 
          fileA={deckAFile} 
          fileB={deckBFile} 
          thickness={waveformThickness} 
          colorA={deckAColor} 
          colorB={deckBColor} 
          height={effectiveWaveformHeight} 
          isCompact={libraryVisible}
          hotCuesA={deckAHotCues}
          hotCuesB={deckBHotCues}
        />
      </div>

      {/* Main Deck Area */}
      <MidiLearnContext.Provider value={{ learnMode: midiLearnMode, activeTarget: activeMidiTarget, setActiveTarget: setActiveMidiTarget }}>
        <main className="flex-1 flex overflow-hidden min-h-0 w-full relative">
          {/* Audio-reactive Background Visualizer */}
          <BackgroundVisualizer 
            mode={bgVisMode} 
            deckAColor={deckAColor} 
            deckBColor={deckBColor} 
            deckAPlay={deckAPlay} 
            deckBPlay={deckBPlay} 
          />
          <div className="w-full h-full flex items-center justify-center transition-transform duration-200 z-10">
          <div 
            className={`flex gap-3 md:gap-4 max-w-7xl mx-auto w-full h-full items-center justify-center transition-all duration-300 ${
              libraryVisible ? 'p-2 md:p-3' : 'p-3 md:p-6'
            }`}
            style={{ 
              transform: `scale(${scale}) rotate(${rotation}deg) translate(${translateX}px, ${translateY}px)`
            }}
          >
            {/* Deck A */}
            <Deck 
              id="A" 
              theme={deckAColor}
              file={deckAFile} 
              isPlaying={deckAPlay}
              isLooping={deckALoop}
              keylock={deckAKeylock}
              hotCues={deckAHotCues}
              onLoadClick={() => fileInputARef.current?.click()}
              onPlay={() => togglePlay('A')}
              onCue={() => toggleCue('A')}
              onLoop={() => toggleLoop('A')}
              onKeylock={() => toggleKeylock('A')}
              onHotCueClick={(idx: number, isDel: boolean) => handleHotCueClick('A', idx, isDel)}
              thickness={waveformThickness}
              isCompact={libraryVisible}
            />

            {/* Mixer */}
            <div className={`w-72 sm:w-80 md:w-84 shrink-0 bg-neutral-900/50 rounded-2xl border border-white/5 flex flex-col justify-between items-center h-full transition-all duration-300 ${libraryVisible ? 'p-3' : 'p-4 md:p-5'}`}>
              <h2 className={`text-[10px] font-bold tracking-[0.2em] opacity-50 shrink-0 ${libraryVisible ? 'mb-1.5' : 'mb-3'}`}>MIXER</h2>
              
              <div className="flex-1 flex justify-between items-stretch w-full px-2 relative min-h-0">
                
                {/* Deck A Column */}
                <div className="flex flex-col items-center gap-2 h-full">
                  <EqControls deck="A" color={deckAColor} />

                  {/* Channel A PFL CUE Button */}
                  <MidiControl midiKey="DECK_A_PFL_CUE">
                    <button
                      onClick={() => togglePflCue('A')}
                      className={`w-9 h-7 rounded-md flex items-center justify-center border font-mono font-bold text-[10px] transition-all my-1 ${
                        cueAActive
                          ? 'bg-amber-400/20 border-amber-400 text-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                          : 'bg-black/40 border-white/10 text-white/40 hover:text-white'
                      }`}
                      title="Channel A Headphone Cue (PFL)"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                    </button>
                  </MidiControl>

                  {/* Deck A Vol Fader */}
                  <div className="flex flex-col items-center mt-auto h-[120px]">
                    <span className="text-[10px] opacity-50 mb-2 font-bold" style={{ color: deckAColor }}>CH A</span>
                    <MidiControl midiKey="DECK_A_VOLUME">
                      <div className="flex-1 flex justify-center items-center relative w-12 h-full">
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          value={deckAVol} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setDeckAVol(val);
                            getAudioEngine().deckA.setVolume(val);
                          }}
                          className="fader-vertical accent-custom absolute w-[100px] h-3 bg-black border border-white/10 rounded-full"
                          style={{ transform: 'rotate(-90deg)', '--fader-color': deckAColor } as React.CSSProperties}
                        />
                      </div>
                    </MidiControl>
                  </div>
                </div>

                {/* Central Column: VU Meters + Headphone Controls */}
                <div className="flex-1 flex flex-col items-center justify-start gap-1 sm:gap-1.5 h-full pt-0 px-1 sm:px-1.5 min-w-0 min-h-0">
                  {/* Headphone PFL Section */}
                  <div className={`flex flex-col items-center gap-1 rounded-xl bg-black/40 border border-white/5 w-full shrink-0 ${libraryVisible ? 'p-1.5' : 'p-2'}`}>
                    <span className="text-[8px] font-mono tracking-widest text-amber-400 font-bold uppercase flex items-center gap-1">
                      <Headphones className="w-3 h-3" /> CUE / PFL
                    </span>
                    <div className="flex items-center justify-around w-full gap-2">
                      <MidiControl midiKey="HEADPHONE_VOLUME">
                        <Knob 
                          label="VOL" 
                          value={cueVol} 
                          onChange={(v) => {
                            setCueVol(v);
                            getAudioEngine().setCueVolume(v);
                          }} 
                          accent 
                          color="#f59e0b" 
                        />
                      </MidiControl>
                      <MidiControl midiKey="CUE_MIX">
                        <Knob 
                          label="MIX" 
                          value={cueMix} 
                          onChange={(v) => {
                            setCueMix(v);
                            getAudioEngine().setCueMix(v);
                          }} 
                          accent 
                          color="#f59e0b" 
                        />
                      </MidiControl>
                    </div>
                  </div>

                  {/* Full-Height Pro Master/Channel Levels Visualizer spanning right to X-FADER */}
                  <DualChannelVuMeter colorA={deckAColor} colorB={deckBColor} isCompact={libraryVisible} />
                </div>

                {/* Deck B Column */}
                <div className="flex flex-col items-center gap-2 h-full">
                  <EqControls deck="B" color={deckBColor} />

                  {/* Channel B PFL CUE Button */}
                  <MidiControl midiKey="DECK_B_PFL_CUE">
                    <button
                      onClick={() => togglePflCue('B')}
                      className={`w-9 h-7 rounded-md flex items-center justify-center border font-mono font-bold text-[10px] transition-all my-1 ${
                        cueBActive
                          ? 'bg-amber-400/20 border-amber-400 text-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                          : 'bg-black/40 border-white/10 text-white/40 hover:text-white'
                      }`}
                      title="Channel B Headphone Cue (PFL)"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                    </button>
                  </MidiControl>

                  {/* Deck B Vol Fader */}
                  <div className="flex flex-col items-center mt-auto h-[120px]">
                    <span className="text-[10px] opacity-50 mb-2 font-bold" style={{ color: deckBColor }}>CH B</span>
                    <MidiControl midiKey="DECK_B_VOLUME">
                      <div className="flex-1 flex justify-center items-center relative w-12 h-full">
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          value={deckBVol} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setDeckBVol(val);
                            getAudioEngine().deckB.setVolume(val);
                          }}
                          className="fader-vertical accent-custom absolute w-[100px] h-3 bg-black border border-white/10 rounded-full"
                          style={{ transform: 'rotate(-90deg)', '--fader-color': deckBColor } as React.CSSProperties}
                        />
                      </div>
                    </MidiControl>
                  </div>
                </div>
                
              </div>

              {/* Crossfader */}
              <div className={`w-full shrink-0 ${libraryVisible ? 'mt-2' : 'mt-3 sm:mt-4'}`}>
                <div className="flex justify-between text-[9px] opacity-40 font-mono mb-1 font-bold">
                  <span style={{ color: deckAColor }}>A</span>
                  <span>X-FADER</span>
                  <span style={{ color: deckBColor }}>B</span>
                </div>
                <MidiControl midiKey="CROSSFADER">
                  <div className="relative w-full px-4 h-8 flex items-center justify-center">
                    <input 
                      type="range" min="0" max="1" step="0.01" 
                      value={crossfader} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setCrossfader(val);
                        getAudioEngine().updateCrossfader(val);
                      }}
                      className="fader-horizontal w-full h-3 bg-black rounded-full border border-white/10"
                    />
                  </div>
                </MidiControl>
              </div>
            </div>

            {/* Deck B */}
            <Deck 
              id="B" 
              theme={deckBColor}
              file={deckBFile} 
              isPlaying={deckBPlay}
              isLooping={deckBLoop}
              keylock={deckBKeylock}
              hotCues={deckBHotCues}
              onLoadClick={() => fileInputBRef.current?.click()}
              onPlay={() => togglePlay('B')}
              onCue={() => toggleCue('B')}
              onLoop={() => toggleLoop('B')}
              onKeylock={() => toggleKeylock('B')}
              onHotCueClick={(idx: number, isDel: boolean) => handleHotCueClick('B', idx, isDel)}
              thickness={waveformThickness}
              isCompact={libraryVisible}
            />
          </div>
        </div>
      </main>
      </MidiLearnContext.Provider>

      {/* Media Browser with IndexedDB at Bottom - Smooth sliding drawer */}
      <div 
        className={`shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${
          libraryVisible ? 'h-52 opacity-100' : 'h-0 opacity-0 pointer-events-none'
        }`}
      >
        <MediaBrowser onLoadToDeck={handleLoadDeck} onClose={() => setLibraryVisible(false)} />
      </div>

      <AILab 
        isOpen={aiLabOpen} 
        onClose={() => setAiLabOpen(false)} 
        onAddTrack={(file) => {
          window.dispatchEvent(new CustomEvent('dj-add-file', { detail: { file } }));
        }} 
      />

      {/* Hidden File Inputs */}
      <input type="file" ref={fileInputARef} className="hidden" accept="audio/*" onChange={(e) => e.target.files?.[0] && handleLoadDeck('A', e.target.files[0])} />
      <input type="file" ref={fileInputBRef} className="hidden" accept="audio/*" onChange={(e) => e.target.files?.[0] && handleLoadDeck('B', e.target.files[0])} />
      
    </div>
  );
}

function EqControls({ deck, color }: { deck: 'A' | 'B', color: string }) {
  const [eqHigh, setEqHigh] = useState(0.5);
  const [eqMid, setEqMid] = useState(0.5);
  const [eqLow, setEqLow] = useState(0.5);
  const [filter, setFilter] = useState(0.5);

  useEffect(() => {
    const handleMidiUpdate = (e: any) => {
      const { controlName, normalized } = e.detail;
      
      if (deck === 'A') {
        if (controlName === 'DECK_A_EQ_HIGH') setEqHigh(normalized);
        if (controlName === 'DECK_A_EQ_MID') setEqMid(normalized);
        if (controlName === 'DECK_A_EQ_LOW') setEqLow(normalized);
        if (controlName === 'DECK_A_FILTER') setFilter(normalized);
      } else {
        if (controlName === 'DECK_B_EQ_HIGH') setEqHigh(normalized);
        if (controlName === 'DECK_B_EQ_MID') setEqMid(normalized);
        if (controlName === 'DECK_B_EQ_LOW') setEqLow(normalized);
        if (controlName === 'DECK_B_FILTER') setFilter(normalized);
      }
    };
    window.addEventListener('dj-control', handleMidiUpdate);
    return () => window.removeEventListener('dj-control', handleMidiUpdate);
  }, [deck]);

  const applyEq = (band: string, val: number) => {
    const engine = getAudioEngine();
    const target = deck === 'A' ? engine.deckA : engine.deckB;
    if (band === 'high') { setEqHigh(val); target.setEqHigh(val); }
    if (band === 'mid') { setEqMid(val); target.setEqMid(val); }
    if (band === 'low') { setEqLow(val); target.setEqLow(val); }
  };

  const applyFilter = (val: number) => {
    setFilter(val);
    const target = deck === 'A' ? getAudioEngine().deckA : getAudioEngine().deckB;
    target.setFilter(val);
  };

  return (
    <div className="flex flex-col justify-center gap-3 w-14 items-center shrink-0">
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_EQ_HIGH' : 'DECK_B_EQ_HIGH'}>
        <Knob label="HIGH" value={eqHigh} onChange={(v) => applyEq('high', v)} accent color={color} />
      </MidiControl>
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_EQ_MID' : 'DECK_B_EQ_MID'}>
        <Knob label="MID" value={eqMid} onChange={(v) => applyEq('mid', v)} accent color={color} />
      </MidiControl>
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_EQ_LOW' : 'DECK_B_EQ_LOW'}>
        <Knob label="LOW" value={eqLow} onChange={(v) => applyEq('low', v)} accent color={color} />
      </MidiControl>
      <div className="h-px w-full bg-white/10 my-1" />
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_FILTER' : 'DECK_B_FILTER'}>
        <Knob label="FILTER" value={filter} onChange={applyFilter} accent color={color} />
      </MidiControl>
    </div>
  );
}

function DualChannelVuMeter({ 
  colorA, 
  colorB, 
  isCompact = false 
}: { 
  colorA: string; 
  colorB: string; 
  isCompact?: boolean; 
}) {
  const [levelA, setLevelA] = useState(0);
  const [levelB, setLevelB] = useState(0);
  const [peakA, setPeakA] = useState(0);
  const [peakB, setPeakB] = useState(0);
  const lastPeakTimeA = useRef(0);
  const lastPeakTimeB = useRef(0);

  useEffect(() => {
    let animId: number;
    const update = () => {
      const engine = getAudioEngine();
      const now = performance.now();
      
      const rawA = engine.deckA.getLevel();
      const rawB = engine.deckB.getLevel();

      // Analog VU meter ballistics: Fast attack on transients, smooth exponential decay (~18 dB/sec)
      setLevelA(prev => rawA >= prev ? rawA : Math.max(0, prev * 0.90));
      setLevelB(prev => rawB >= prev ? rawB : Math.max(0, prev * 0.90));

      // Peak hold with 750ms hold time then smooth falloff
      setPeakA(prev => {
        if (rawA >= prev) {
          lastPeakTimeA.current = now;
          return rawA;
        }
        if (now - lastPeakTimeA.current > 750) {
          return Math.max(rawA, prev * 0.95);
        }
        return prev;
      });

      setPeakB(prev => {
        if (rawB >= prev) {
          lastPeakTimeB.current = now;
          return rawB;
        }
        if (now - lastPeakTimeB.current > 750) {
          return Math.max(rawB, prev * 0.95);
        }
        return prev;
      });

      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, []);

  const totalSegments = isCompact ? 24 : 28;
  const isClipA = levelA > 0.94;
  const isClipB = levelB > 0.94;

  return (
    <div className="w-full flex-1 min-h-0 h-full flex flex-col justify-between bg-black/80 rounded-xl sm:rounded-2xl border border-white/10 p-2 sm:p-2.5 my-0.5 shadow-xl overflow-hidden transition-all duration-300">
      {/* Header with Channel labels & Clip warning indicators */}
      <div className="flex items-center justify-between w-full px-1 mb-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-black" style={{ color: colorA }}>CH A</span>
          <span 
            className={`w-2 h-2 rounded-full transition-colors ${
              isClipA ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-white/10'
            }`} 
            title="Channel A Clip"
          />
        </div>
        <span className="text-[8px] font-mono tracking-widest text-white/40 uppercase font-bold">LEVELS</span>
        <div className="flex items-center gap-1.5">
          <span 
            className={`w-2 h-2 rounded-full transition-colors ${
              isClipB ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-white/10'
            }`} 
            title="Channel B Clip"
          />
          <span className="text-[10px] font-mono font-black" style={{ color: colorB }}>CH B</span>
        </div>
      </div>

      {/* Main Meter Area: Dual LED Ladders with Center dB Legend */}
      <div className="flex-1 flex items-stretch justify-between w-full h-full min-h-0 gap-1.5 sm:gap-2">
        {/* Channel A LED Ladder */}
        <div className="flex-1 flex flex-col-reverse justify-between bg-black/60 rounded-lg p-1 border border-white/10 relative overflow-hidden h-full">
          {Array.from({ length: totalSegments }).map((_, i) => {
            const threshold = i / totalSegments;
            const isActive = levelA > threshold;
            const isPeak = Math.round(peakA * (totalSegments - 1)) === i && peakA > 0.05;
            
            // LED Tier Colors
            const isRed = i >= totalSegments - 2;
            const isOrange = i >= totalSegments - 5;
            const isYellow = i >= totalSegments - 9;

            let ledColor = 'bg-white/[0.06] border border-white/[0.04]';
            let activeStyle: React.CSSProperties = {};

            if (isActive || isPeak) {
              if (isRed) {
                ledColor = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] border-red-400';
              } else if (isOrange) {
                ledColor = 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.85)] border-orange-400';
              } else if (isYellow) {
                ledColor = 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.75)] border-yellow-300';
              } else {
                ledColor = `shadow-[0_0_6px_${colorA}80] border-transparent`;
                activeStyle = { backgroundColor: colorA };
              }
            }

            return (
              <div 
                key={i} 
                className={`w-full flex-1 mb-[1.5px] rounded-xs transition-colors duration-75 ${ledColor}`}
                style={activeStyle}
              />
            );
          })}
        </div>

        {/* Central dB Scale Markings */}
        <div className="flex flex-col justify-between py-1 text-[8px] font-mono font-bold text-white/40 shrink-0 select-none text-center min-w-[26px]">
          <span className="text-red-400 font-black tracking-wider">CLIP</span>
          <span className="text-orange-400">+6</span>
          <span>+3</span>
          <span className="text-yellow-400 font-black">0</span>
          <span>-3</span>
          <span>-6</span>
          <span>-12</span>
          <span>-18</span>
          <span>-24</span>
          <span className="opacity-60">-∞</span>
        </div>

        {/* Channel B LED Ladder */}
        <div className="flex-1 flex flex-col-reverse justify-between bg-black/60 rounded-lg p-1 border border-white/10 relative overflow-hidden h-full">
          {Array.from({ length: totalSegments }).map((_, i) => {
            const threshold = i / totalSegments;
            const isActive = levelB > threshold;
            const isPeak = Math.round(peakB * (totalSegments - 1)) === i && peakB > 0.05;
            
            const isRed = i >= totalSegments - 2;
            const isOrange = i >= totalSegments - 5;
            const isYellow = i >= totalSegments - 9;

            let ledColor = 'bg-white/[0.06] border border-white/[0.04]';
            let activeStyle: React.CSSProperties = {};

            if (isActive || isPeak) {
              if (isRed) {
                ledColor = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] border-red-400';
              } else if (isOrange) {
                ledColor = 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.85)] border-orange-400';
              } else if (isYellow) {
                ledColor = 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.75)] border-yellow-300';
              } else {
                ledColor = `shadow-[0_0_6px_${colorB}80] border-transparent`;
                activeStyle = { backgroundColor: colorB };
              }
            }

            return (
              <div 
                key={i} 
                className={`w-full flex-1 mb-[1.5px] rounded-xs transition-colors duration-75 ${ledColor}`}
                style={activeStyle}
              />
            );
          })}
        </div>
      </div>

      {/* Footer dB readout */}
      <div className="flex justify-between items-center px-1.5 mt-1 text-[8px] font-mono text-white/35 tracking-widest uppercase shrink-0 font-bold">
        <span>PEAK</span>
        <span>dBu</span>
        <span>HOLD</span>
      </div>
    </div>
  );
}

function Deck({ 
  id, theme, file, isPlaying, isLooping, keylock, hotCues,
  onLoadClick, onPlay, onCue, onLoop, onKeylock, onHotCueClick, thickness,
  isCompact = false
}: any) {
  const [pitch, setPitch] = useState(0.5);
  const [progress, setProgress] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [rotation, setRotation] = useState(0);
  const [baseBpm, setBaseBpm] = useState(120);
  const [delMode, setDelMode] = useState(false);
  const [duration, setDuration] = useState(0);

  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const startRotation = useRef(0);
  const isJogTouched = useRef(false);
  const wasPlayingBeforeTouch = useRef(false);
  const pitchNudgeTimeout = useRef<any>(null);
  const lastDragTime = useRef<number>(0);

  const middleSectionRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({
    jogSize: 210,
    pitchWidth: 44,
    pitchHeight: 210,
    sliderLength: 130,
    gap: 14
  });

  useLayoutEffect(() => {
    const updateDims = () => {
      const el = middleSectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const availW = rect.width;
      const availH = rect.height;

      if (availW <= 10 || availH <= 10) return;

      // Adaptive gap: 8px on tight screens, up to 20px on spacious screens
      const targetGap = Math.round(Math.max(8, Math.min(20, availW * 0.035)));

      // Adaptive pitch fader width: 38px to 52px
      const targetPitchWidth = Math.round(Math.max(38, Math.min(52, availW * 0.135)));

      // Calculate maximum jog wheel diameter without overflowing container
      // 12px buffer preserves comfortable margin from deck border
      const maxW = availW - targetPitchWidth - targetGap - 12;
      const maxH = availH - 6;

      // Jog wheel diameter bounded by both available width and height (clamped 110px - 280px)
      const jogSize = Math.round(Math.max(110, Math.min(280, Math.min(maxW, maxH))));

      // Pitch fader height matches jog wheel diameter for balanced CDJ aesthetics
      const pitchHeight = jogSize;

      // Pitch fader width scales smoothly with jog size
      const pitchWidth = Math.round(Math.max(38, Math.min(52, Math.min(targetPitchWidth, jogSize * 0.22))));

      // Slider track throw length fits inside pitchHeight leaving space for labels, MT button, and % readout
      const sliderLength = Math.round(Math.max(64, Math.min(185, pitchHeight - 68)));

      setDims({
        jogSize,
        pitchWidth,
        pitchHeight,
        sliderLength,
        gap: targetGap
      });
    };

    updateDims();

    const ro = new ResizeObserver(() => updateDims());
    if (middleSectionRef.current) {
      ro.observe(middleSectionRef.current);
    }

    window.addEventListener('resize', updateDims);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDims);
    };
  }, [isCompact]);

  useEffect(() => {
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    const interval = setInterval(() => {
      const dur = target.duration;
      setDuration(dur);
      if (dur > 0) {
        setProgress((target.currentTime / dur) * 100);
        if (!isDragging.current) {
          setRotation((target.currentTime / 1.8) * 360);
        }
      }
      if (target.peaks !== peaks) setPeaks([...target.peaks]);
      if (target.baseBpm !== baseBpm) setBaseBpm(target.baseBpm);
    }, 40);
    return () => clearInterval(interval);
  }, [id, peaks, baseBpm]);

  useEffect(() => {
    const handleMidiUpdate = (e: any) => {
      const { controlName, normalized } = e.detail;
      if (id === 'A' && controlName === 'DECK_A_PITCH') setPitch(normalized);
      if (id === 'B' && controlName === 'DECK_B_PITCH') setPitch(normalized);
    };
    const handleMidiSync = (e: any) => {
      if (e.detail?.deck === id) handleSync();
    };
    const handleJogTouch = (e: any) => {
      if (e.detail?.deck !== id) return;
      const touched = !!e.detail?.touched;
      isJogTouched.current = touched;
      const engine = getAudioEngine();
      const target = id === 'A' ? engine.deckA : engine.deckB;

      if (touched) {
        // Platter touch: Vinyl cue hold & enter scratch mode
        wasPlayingBeforeTouch.current = target.isPlaying;
        target.startScratch();
      } else {
        // Platter release: Resume playback if it was playing before touch
        target.endScratch(wasPlayingBeforeTouch.current);
        wasPlayingBeforeTouch.current = false;
      }
    };

    let lastMidiJogTime = 0;
    const handleJogMove = (e: any) => {
      if (e.detail?.deck !== id) return;
      const delta = e.detail?.delta || 0;
      if (delta === 0) return;

      const engine = getAudioEngine();
      const target = id === 'A' ? engine.deckA : engine.deckB;

      // Rotate visual vinyl platter
      const rotDelta = delta * 6;
      setRotation(r => r + rotDelta);

      if (isJogTouched.current || !target.isPlaying) {
        // SCRATCH / VINYL SEEK MODE:
        const now = performance.now();
        const dt = Math.max(5, lastMidiJogTime > 0 ? now - lastMidiJogTime : 20);
        lastMidiJogTime = now;

        const timeDiff = (rotDelta / 360) * 1.8;
        const velocity = Math.max(-5.0, Math.min(5.0, (timeDiff / (dt / 1000))));

        target.scratchMove(velocity, timeDiff);
      } else {
        // PITCH BEND / NUDGE MODE (Outer Rim rotation while playing):
        const factor = delta > 0 ? 1.05 : 0.95;
        target.jogNudge(factor);

        clearTimeout(pitchNudgeTimeout.current);
        pitchNudgeTimeout.current = setTimeout(() => {
          target.restoreRate();
        }, 150);
      }
    };

    window.addEventListener('dj-control', handleMidiUpdate);
    window.addEventListener('dj-sync', handleMidiSync);
    window.addEventListener('dj-jog', handleJogMove);
    window.addEventListener('dj-jog-touch', handleJogTouch);
    return () => {
      window.removeEventListener('dj-control', handleMidiUpdate);
      window.removeEventListener('dj-sync', handleMidiSync);
      window.removeEventListener('dj-jog', handleJogMove);
      window.removeEventListener('dj-jog-touch', handleJogTouch);
      clearTimeout(pitchNudgeTimeout.current);
    };
  }, [id, baseBpm, pitch]);

  const applyPitch = (val: number) => {
    setPitch(val);
    const target = id === 'A' ? getAudioEngine().deckA : getAudioEngine().deckB;
    target.setPitch(val);
  };

  const handleSync = () => {
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    const other = id === 'A' ? engine.deckB : engine.deckA;
    if (target.baseBpm > 0 && other.baseBpm > 0) {
      const otherRate = other.playbackRate || 1.0; 
      const otherCurrentBpm = other.baseBpm * otherRate;
      
      const targetRate = otherCurrentBpm / target.baseBpm;
      let normalizedPitch = (targetRate - 1.0) / 0.32;
      normalizedPitch = Math.max(-0.5, Math.min(0.5, normalizedPitch));
      applyPitch(normalizedPitch + 0.5);
    }
  };

  const handleJogPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    startRotation.current = rotation;
    lastDragTime.current = performance.now();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    // Vinyl slipmat hold: Pause music immediately on touch & enter scratch mode
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    wasPlayingBeforeTouch.current = target.isPlaying;
    target.startScratch();
  };

  const handleJogPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastDragTime.current);
    lastDragTime.current = now;

    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const diff = (dx - dy) * 1.5; 
    const newRot = startRotation.current + diff;
    setRotation(newRot);
    
    // Scratch / seek while paused under hand
    // 360 degrees = 1.8 seconds of audio (standard 33 1/3 RPM vinyl speed)
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    const timeDiff = (diff / 360) * 1.8;
    const velocity = Math.max(-5.0, Math.min(5.0, (timeDiff / (dt / 1000))));

    target.scratchMove(velocity, timeDiff);

    dragStartPos.current = { x: e.clientX, y: e.clientY };
    startRotation.current = newRot;
  };

  const handleJogPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    // Vinyl slipmat release: Resume playback if it was playing before touch
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    target.endScratch(wasPlayingBeforeTouch.current);
    wasPlayingBeforeTouch.current = false;
  };

  const currentBpm = (baseBpm * (1.0 + (pitch - 0.5) * 0.32)).toFixed(2);

  return (
    <div className={`flex-1 bg-neutral-900/30 rounded-2xl border flex flex-col justify-between relative overflow-hidden h-full transition-all duration-300 ${isCompact ? 'p-3 md:p-3.5' : 'p-4 md:p-5'} ${isPlaying ? 'border-opacity-30 z-10' : 'border-white/5'}`} style={isPlaying ? { borderColor: theme, boxShadow: `0 0 100px ${theme}40, inset 0 0 60px ${theme}20` } : {}}>
      
      {/* 1. Top Bar (Track Info & Mini Waveform) */}
      <div className={`flex justify-between items-start shrink-0 ${isCompact ? 'mb-1.5 sm:mb-2' : 'mb-2 sm:mb-3 lg:mb-3.5'}`}>
        <div className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2 sm:p-2.5 cursor-pointer transition-colors flex flex-col gap-1.5" style={{ borderColor: isPlaying ? theme : undefined }} onClick={onLoadClick}>
          {/* Mini Waveform with Hot Cue Markers */}
          <div className="w-full h-8 sm:h-9 bg-black/40 border border-white/5 rounded relative overflow-hidden flex shrink-0">
             <div className="absolute inset-0 pointer-events-none opacity-50">
               <WaveformSVG 
                 peaks={peaks} 
                 color={theme} 
                 progress={progress} 
                 height={36} 
                 thickness={thickness} 
                 hotCues={hotCues} 
                 duration={duration} 
                 compact={true}
               />
             </div>
             <div className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none" style={{ left: `${progress}%`, backgroundColor: theme, boxShadow: `0 0 10px ${theme}` }} />
          </div>
          <div className="flex justify-between items-center mb-0.5">
             <div className="text-[10px] tracking-widest font-mono font-bold flex items-center gap-2" style={{ color: theme }}>
               DECK {id}
               {keylock && <span className="text-[8px] bg-[#00f2ff]/20 text-[#00f2ff] px-1 rounded border border-[#00f2ff]/40">MT</span>}
             </div>
             <div className="text-[10px] font-mono tracking-wider opacity-50">BPM <span className="text-white font-bold text-xs">{currentBpm}</span></div>
          </div>
          <div className="font-mono text-xs sm:text-sm truncate opacity-90">
            {file ? file.name : "CLICK TO LOAD TRACK"}
          </div>
        </div>
      </div>

      {/* 2. Middle Section: Vinyl Jog Wheel & Pitch Fader side-by-side (Scaled to Max Size with Breathing Room) */}
      <div 
        ref={middleSectionRef}
        className="flex-1 flex items-center justify-center my-auto min-h-0 w-full px-2 py-1"
        style={{ gap: `${dims.gap}px` }}
      >
        {/* Jog Wheel (Vinyl) - Dynamically Scaled Platter with MIDI Learn */}
        <div className="flex items-center justify-center shrink-0">
          <MidiControl midiKey={id === 'A' ? 'DECK_A_JOG_TURN' : 'DECK_B_JOG_TURN'}>
            <div 
              className={`rounded-full border-4 flex items-center justify-center relative transition-colors duration-150 shrink-0 cursor-grab active:cursor-grabbing ${isPlaying ? 'bg-black/40' : 'border-white/5 bg-black/20'}`} 
              style={{
                width: `${dims.jogSize}px`,
                height: `${dims.jogSize}px`,
                ...(isPlaying ? { borderColor: theme, boxShadow: `0 0 90px ${theme}60, inset 0 0 45px ${theme}40` } : {})
              }}
              onPointerDown={handleJogPointerDown}
              onPointerMove={handleJogPointerMove}
              onPointerUp={handleJogPointerUp}
              onPointerCancel={handleJogPointerUp}
            >
              {isPlaying && (
                <div className="absolute inset-0 rounded-full animate-ping opacity-30 pointer-events-none" style={{ backgroundColor: theme, animationDuration: '2s' }} />
              )}
              {/* Outer vinyl grooved platter ring - 78% of diameter */}
              <div 
                className={`w-[78%] h-[78%] rounded-full border-2 border-dashed transition-opacity duration-150 ${isPlaying ? 'border-opacity-80' : 'border-white/20'}`} 
                style={{ borderColor: isPlaying ? theme : undefined, transform: `rotate(${rotation}deg)` }}
              >
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full absolute top-1 sm:top-1.5 left-1/2 -translate-x-1/2" style={{ backgroundColor: theme, boxShadow: `0 0 20px ${theme}` }} />
              </div>
              {/* Center Spindle Hub with Vinyl Label - 28% of diameter */}
              <div 
                className="absolute w-[28%] h-[28%] min-w-[40px] min-h-[40px] max-w-[72px] max-h-[72px] rounded-full bg-gradient-to-br from-neutral-800 to-black border border-white/20 flex flex-col items-center justify-center shadow-lg pointer-events-none select-none"
              >
                <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-black border border-white/30 mb-0.5" />
                <div className="text-[7px] sm:text-[8px] font-mono font-bold opacity-40 text-center tracking-wider leading-none">
                  VINYL<br/>CTRL
                </div>
              </div>
            </div>
          </MidiControl>
        </div>

        {/* Vertical Pitch Fader Strip (Dynamically Adjusted Width & Height alongside Vinyl) */}
        <div 
          className="flex flex-col items-center justify-between bg-black/40 border border-white/10 rounded-xl py-2 sm:py-2.5 px-1 sm:px-1.5 shrink-0 shadow-inner transition-colors duration-150"
          style={{ width: `${dims.pitchWidth}px`, height: `${dims.pitchHeight}px` }}
        >
          <span className="text-[8.5px] sm:text-[9.5px] font-bold font-mono tracking-wider opacity-60 shrink-0">PITCH</span>

          {/* Keylock / MT Button */}
          <MidiControl midiKey={id === 'A' ? 'DECK_A_KEYLOCK' : 'DECK_B_KEYLOCK'}>
            <button
              onClick={onKeylock}
              className={`px-1.5 py-0.5 rounded text-[7.5px] sm:text-[8px] font-mono font-bold tracking-tight border transition-all shrink-0 ${
                keylock 
                  ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-[#00f2ff] shadow-[0_0_10px_rgba(0,242,255,0.4)]' 
                  : 'bg-black/40 border-white/15 text-white/40 hover:text-white'
              }`}
              title="Master Tempo / Keylock: Preserves pitch when tempo changes"
            >
              {dims.pitchWidth < 44 ? (keylock ? 'MT' : 'LOCK') : (keylock ? 'MT ON' : 'KEYLOCK')}
            </button>
          </MidiControl>

          {/* Fader Track - Scaled Throw */}
          <MidiControl midiKey={id === 'A' ? 'DECK_A_PITCH' : 'DECK_B_PITCH'}>
            <div 
              className="relative w-7 sm:w-8 flex items-center justify-center my-auto shrink-0"
              style={{ height: `${dims.sliderLength}px` }}
            >
              {/* 0% Center detent tick line */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40 pointer-events-none z-10" />
              {/* Calibration ticks */}
              <div className="absolute top-1/4 left-1 w-1.5 h-px bg-white/20 pointer-events-none" />
              <div className="absolute top-3/4 left-1 w-1.5 h-px bg-white/20 pointer-events-none" />
              <input 
                type="range" min="0" max="1" step="0.001" 
                value={pitch} 
                onChange={(e) => applyPitch(parseFloat(e.target.value))}
                className="pitch-fader accent-custom absolute h-2.5 bg-black border border-white/15 rounded-full cursor-pointer"
                style={{ 
                  width: `${dims.sliderLength}px`,
                  transform: 'rotate(-90deg)', 
                  '--fader-color': theme 
                } as React.CSSProperties}
              />
            </div>
          </MidiControl>

          {/* % Readout */}
          <span 
            className="text-[8px] sm:text-[9px] font-mono font-bold tracking-tight shrink-0" 
            style={{ color: pitch !== 0.5 ? theme : 'rgba(255,255,255,0.5)' }}
          >
            {((pitch - 0.5) * 32).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 3. Bottom Section: Hot Cues & Transport Row sharing the exact same container & total width */}
      <div className={`w-full max-w-[340px] md:max-w-[360px] mx-auto flex flex-col gap-2 shrink-0 ${isCompact ? 'mt-1.5 sm:mt-2' : 'mt-2 sm:mt-3 lg:mt-3.5'} pb-1`}>
        
        {/* Hot Cues Header & Row */}
        <div className="w-full flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-mono tracking-widest font-bold opacity-50 uppercase">HOT CUES</span>
            <button
              onClick={() => setDelMode(!delMode)}
              className={`text-[8px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border transition-all ${
                delMode 
                  ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse font-bold' 
                  : 'border-white/10 text-white/30 hover:text-white bg-black/20'
              }`}
              title="Click pad while DEL is ON to clear it"
            >
              {delMode ? 'DEL ACTIVE' : 'DEL CUE'}
            </button>
          </div>

          {/* 4 Compact Performance Pads - Exactly 4 columns */}
          <div className="grid grid-cols-4 gap-2 w-full">
            {HOT_CUE_COLORS.map((padColor, idx) => {
              const cueTime = hotCues[idx];
              const isSet = cueTime !== null && cueTime !== undefined;
              const formattedTime = isSet 
                ? `${Math.floor(cueTime / 60)}:${(cueTime % 60).toFixed(1).padStart(4, '0')}`
                : null;

              return (
                <MidiControl key={idx} midiKey={id === 'A' ? `DECK_A_HOTCUE_${idx + 1}` : `DECK_B_HOTCUE_${idx + 1}`}>
                  <button
                    onClick={() => onHotCueClick(idx, delMode)}
                    className={`h-9 rounded-lg border flex flex-col items-center justify-center relative transition-all active:scale-95 group select-none ${
                      isSet 
                        ? 'bg-black/60 shadow-md' 
                        : 'bg-black/30 border-white/10 hover:border-white/30 text-white/30 hover:text-white/70'
                    }`}
                    style={isSet ? {
                      borderColor: padColor,
                      boxShadow: `0 0 10px ${padColor}40, inset 0 0 6px ${padColor}20`,
                      color: padColor
                    } : {}}
                    title={isSet ? `Hot Cue ${idx + 1}: ${formattedTime} (Click to jump)` : `Hot Cue ${idx + 1} Empty (Click to set)`}
                  >
                    <span className="text-[10px] font-black font-mono leading-none">
                      {idx + 1}
                    </span>
                    <span className="text-[7.5px] font-mono mt-0.5 opacity-80 leading-none">
                      {isSet ? formattedTime : '+ SET'}
                    </span>
                  </button>
                </MidiControl>
              );
            })}
          </div>
        </div>

        {/* Transport Row - Exactly 4 columns, matching the exact width & column gaps of Hot Cues above! */}
        <div className="grid grid-cols-4 gap-2 w-full">
          {/* SYNC */}
          <MidiControl midiKey={id === 'A' ? 'DECK_A_SYNC_BTN' : 'DECK_B_SYNC_BTN'}>
            <button 
              onClick={handleSync}
              className="h-12 rounded-xl text-[11px] font-bold font-mono tracking-wider bg-black/40 border border-white/20 hover:border-white/60 transition-all text-white flex items-center justify-center active:scale-95 shadow-sm"
              title="Sync BPM with other deck"
            >
              SYNC
            </button>
          </MidiControl>

          {/* PLAY / PAUSE */}
          <MidiControl midiKey={id === 'A' ? 'DECK_A_PLAY_BTN' : 'DECK_B_PLAY_BTN'}>
            <button 
              onClick={onPlay}
              className="h-12 rounded-xl flex items-center justify-center border-2 transition-all hover:scale-105 active:scale-95 shadow-md"
              style={isPlaying ? { backgroundColor: `${theme}20`, borderColor: theme, color: theme, boxShadow: `0 0 15px ${theme}40` } : { backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.15)', color: 'white' }}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-[1px]" />}
            </button>
          </MidiControl>

          {/* CUE */}
          <MidiControl midiKey={id === 'A' ? 'DECK_A_CUE_BTN' : 'DECK_B_CUE_BTN'}>
            <button 
              onClick={onCue}
              className="h-12 rounded-xl flex items-center justify-center border-2 bg-black/40 border-white/15 hover:border-white/30 text-white transition-all active:scale-95 shadow-sm"
            >
              <span className="font-bold text-[11px] tracking-wider">CUE</span>
            </button>
          </MidiControl>

          {/* LOOP */}
          <MidiControl midiKey={id === 'A' ? 'DECK_A_LOOP_BTN' : 'DECK_B_LOOP_BTN'}>
            <button 
              onClick={onLoop}
              className={`h-12 rounded-xl flex items-center justify-center border-2 transition-all hover:scale-105 active:scale-95 shadow-sm ${isLooping ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-black/40 border-white/15 hover:border-white/30 text-white'}`}
              title="Seamless Loop"
            >
              <Repeat className="w-5 h-5" />
            </button>
          </MidiControl>
        </div>

      </div>

    </div>
  );
}

function Knob({ 
  label, value, onChange, accent = false, color = '#ffffff',
  className = '', style, onClickCapture, onMouseDownCapture,
  ...props
}: { 
  label: string, value: number, onChange: (v: number) => void, accent?: boolean, color?: string,
  className?: string, style?: React.CSSProperties, onClickCapture?: (e: any) => void, onMouseDownCapture?: (e: any) => void,
  [key: string]: any
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const startValue = useRef(value);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    startValue.current = value;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = dragStartY.current - moveEvent.clientY;
      let next = startValue.current + (deltaY * 0.005);
      next = Math.max(0, Math.min(1, next));
      onChange(next);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const rotation = -135 + (value * 270);
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const totalArc = circumference * 0.75;
  // Compensate for round linecap (1.5px radius) so the tip aligns with the needle point
  const activeLength = value > 0.01 ? Math.max(0.1, (value * totalArc) - 1.5) : 0;

  const isMidiLinked = props['data-midi-linked'];
  const midiTheme = props['data-midi-theme'];

  return (
    <div 
      className={`flex flex-col items-center gap-1.5 ${className}`} 
      style={style}
      onClickCapture={onClickCapture}
      onMouseDownCapture={onMouseDownCapture}
    >
      <div className={`relative group cursor-pointer w-11 h-11 shrink-0 ${isDragging ? 'scale-105' : ''} transition-transform`}
        style={isMidiLinked ? { filter: `drop-shadow(0 0 8px ${midiTheme})` } : undefined}
        onMouseDown={handleMouseDown}
        onWheel={(e) => {
          e.preventDefault();
          let next = value - (e.deltaY * 0.002);
          next = Math.max(0, Math.min(1, next));
          onChange(next);
        }}
      >
        <svg className="absolute inset-0 w-full h-full transform rotate-[135deg] pointer-events-none">
          <circle
            cx="22" cy="22" r={radius}
            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"
            strokeDasharray={`${totalArc} ${circumference}`}
            strokeLinecap="round"
          />
          {value > 0.01 && (
            <circle
              cx="22" cy="22" r={radius}
              fill="none" stroke={accent ? color : '#ffffff'} strokeWidth="3"
              strokeDasharray={`${activeLength} ${circumference}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              style={{ 
                filter: accent ? `drop-shadow(0 0 5px ${color})` : `drop-shadow(0 0 5px rgba(255,255,255,0.7))`
              }}
            />
          )}
        </svg>

        <div className="absolute inset-1 rounded-full border border-white/10 bg-black/80 shadow-inner" />
        <div 
          className="absolute inset-1 rounded-full pointer-events-none"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div 
            className={`w-[2.5px] h-2.5 absolute top-1 left-1/2 -translate-x-1/2 rounded-full ${!accent ? 'bg-white' : ''}`}
            style={accent ? { backgroundColor: color, boxShadow: `0 0 8px ${color}` } : {}}
          />
        </div>
      </div>
      <span className="text-[8px] font-bold tracking-wider opacity-50 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
        {label}
      </span>
    </div>
  );
}
