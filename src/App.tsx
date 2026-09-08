import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, FastForward, SkipBack, Repeat, 
  Volume2, Sliders, Music, FileAudio, Settings, Wrench, RefreshCw, ZoomIn, ZoomOut, Move
} from 'lucide-react';
import { getAudioEngine } from './lib/AudioEngine';
import { initTraktorMIDI, TRAKTOR_S2_MAP, setMidiLearnTarget } from './lib/TraktorMIDI';
import { MediaBrowser } from './components/MediaBrowser';
import { AILab } from './components/AILab';

export const MidiLearnContext = React.createContext<{
  learnMode: boolean;
  activeTarget: string | null;
  setActiveTarget: (key: string) => void;
}>({ learnMode: false, activeTarget: null, setActiveTarget: () => {} });

export function MidiControl({ midiKey, children }: { midiKey: string, children: React.ReactElement }) {
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

const WaveformSVG = ({ peaks, color, progress, height = 100, className = '', direction = 'center', thickness = 'solid' }: { peaks: number[], color: string, progress: number, height?: number, className?: string, direction?: 'center'|'up'|'down', thickness?: 'solid'|'thick'|'thin' }) => {
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

  // Use unique IDs for clip paths to prevent conflicts
  const clipId = `clip-${idBase}`;
  const clipFutureId = `clip-future-${idBase}`;

  const strokeWidth = thickness === 'thick' ? 4 : thickness === 'thin' ? 1.5 : 0;

  return (
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
  );
};

const OverlayedWaveforms = ({ 
  isPlayingA, isPlayingB, fileA, fileB, thickness, colorA, colorB, height
}: { 
  isPlayingA: boolean, isPlayingB: boolean, fileA: File | null, fileB: File | null, thickness: 'solid'|'thick'|'thin', colorA: string, colorB: string, height: number
}) => {
  const [progressA, setProgressA] = useState(0);
  const [progressB, setProgressB] = useState(0);
  const [peaksA, setPeaksA] = useState<number[]>([]);
  const [peaksB, setPeaksB] = useState<number[]>([]);
  const [activeDeck, setActiveDeck] = useState<'A'|'B'>('A');
  
  useEffect(() => {
    const engine = getAudioEngine();
    const interval = setInterval(() => {
      const durA = engine.deckA.duration;
      if (durA > 0) setProgressA((engine.deckA.currentTime / durA) * 100);
      if (engine.deckA.peaks !== peaksA) setPeaksA([...engine.deckA.peaks]);
      
      const durB = engine.deckB.duration;
      if (durB > 0) setProgressB((engine.deckB.currentTime / durB) * 100);
      if (engine.deckB.peaks !== peaksB) setPeaksB([...engine.deckB.peaks]);
    }, 50);
    return () => clearInterval(interval);
  }, [peaksA, peaksB]);

  const handleSeek = (e: React.MouseEvent, targetDeck: 'A'|'B') => {
    const engine = getAudioEngine();
    const target = targetDeck === 'A' ? engine.deckA : engine.deckB;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (target.duration > 0) {
        target.audioElement.currentTime = pos * target.duration;
        if (targetDeck === 'A') setProgressA(pos * 100);
        else setProgressB(pos * 100);
    }
  };

  return (
    <div className="w-full bg-black/80 border-b border-white/10 relative z-40 shadow-lg flex flex-col overflow-hidden group" style={{ height: `${height}px` }}>
        <div className="absolute inset-0 flex flex-col">
            {/* Top half seek A */}
            <div className="w-full h-1/2 z-20 cursor-pointer" onClick={(e) => handleSeek(e, 'A')} onMouseEnter={() => setActiveDeck('A')} />
            {/* Bottom half seek B */}
            <div className="w-full h-1/2 z-20 cursor-pointer" onClick={(e) => handleSeek(e, 'B')} onMouseEnter={() => setActiveDeck('B')} />
        </div>

        {/* Waveforms */}
        <div className="absolute top-0 left-0 right-0 h-1/2">
            <WaveformSVG peaks={peaksA} color={colorA} progress={progressA} direction="up" thickness={thickness} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1/2 border-t border-white/10">
            <WaveformSVG peaks={peaksB} color={colorB} progress={progressB} direction="down" thickness={thickness} />
        </div>

        {/* Playheads */}
        <div className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none" style={{ left: `${progressA}%`, backgroundColor: colorA, boxShadow: `0 0 10px ${colorA}` }} />
        <div className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none" style={{ left: `${progressB}%`, backgroundColor: colorB, boxShadow: `0 0 10px ${colorB}` }} />

        {/* Labels */}
        <div className="absolute top-1 left-2 text-[10px] font-mono font-bold z-30 transition-opacity" style={{ color: colorA, opacity: activeDeck === 'A' ? 1 : 0.5 }}>DECK A {fileA ? `- ${fileA.name}` : ''}</div>
        <div className="absolute bottom-1 left-2 text-[10px] font-mono font-bold z-30 transition-opacity" style={{ color: colorB, opacity: activeDeck === 'B' ? 1 : 0.5 }}>DECK B {fileB ? `- ${fileB.name}` : ''}</div>
    </div>
  );
};

export default function App() {
  const [midiLearnMode, setMidiLearnMode] = useState(false);
  const [activeMidiTarget, setActiveMidiTarget] = useState<string | null>(null);
  const [midiUpdateCount, setMidiUpdateCount] = useState(0);
  
  const [libraryVisible, setLibraryVisible] = useState(true);
  const [waveformThickness, setWaveformThickness] = useState<'solid'|'thick'|'thin'>('solid');
  const [deckAColor, setDeckAColor] = useState('#00f2ff');
  const [deckBColor, setDeckBColor] = useState('#ff0055');
  const [waveformHeight, setWaveformHeight] = useState(112);

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

  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiStatus, setMidiStatus] = useState<string>('Unchecked');
  const [deckAFile, setDeckAFile] = useState<File | null>(null);
  const [deckBFile, setDeckBFile] = useState<File | null>(null);

  // Deck State
  const [deckAPlay, setDeckAPlay] = useState(false);
  const [deckBPlay, setDeckBPlay] = useState(false);
  const [deckALoop, setDeckALoop] = useState(false);
  const [deckBLoop, setDeckBLoop] = useState(false);
  
  // Mixer State
  const [crossfader, setCrossfader] = useState(0.5);
  const [masterVol, setMasterVol] = useState(0.8);
  
  const [deckAVol, setDeckAVol] = useState(0.8);
  const [deckBVol, setDeckBVol] = useState(0.8);

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Tools / Customizer State
  const [toolsOpen, setToolsOpen] = useState(false);
  const [aiLabOpen, setAiLabOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    // Start Audio Engine on first interaction to comply with browser policies
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
      // Buttons
      const engine = getAudioEngine();
      setDeckAPlay(engine.deckA.isPlaying);
      setDeckBPlay(engine.deckB.isPlaying);
      setDeckALoop(engine.deckA.loopEnabled);
      setDeckBLoop(engine.deckB.loopEnabled);
    };
    window.addEventListener('dj-control', handleMidiUpdate);
    return () => window.removeEventListener('dj-control', handleMidiUpdate);
  }, []);

  // Poll for transport status (since Audio API fires async)
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = getAudioEngine();
      if (deckAPlay !== engine.deckA.isPlaying) setDeckAPlay(engine.deckA.isPlaying);
      if (deckBPlay !== engine.deckB.isPlaying) setDeckBPlay(engine.deckB.isPlaying);
    }, 100);
    return () => clearInterval(interval);
  }, [deckAPlay, deckBPlay]);

  const handleLoadDeck = async (deck: 'A' | 'B', file: File) => {
    const engine = getAudioEngine();
    if (deck === 'A') {
      setDeckAFile(file);
      await engine.deckA.load(file);
      engine.deckA.setVolume(deckAVol);
    } else {
      setDeckBFile(file);
      await engine.deckB.load(file);
      engine.deckB.setVolume(deckBVol);
    }
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

  const togglePlay = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
    const target = deck === 'A' ? engine.deckA : engine.deckB;
    if (target.isPlaying) target.pause();
    else target.play();
  };

  const toggleCue = (deck: 'A' | 'B') => {
    const engine = getAudioEngine();
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
          <h1 className="font-bold tracking-widest text-sm uppercase"><span className="text-[#00f2ff]">LUCID</span> <span className="text-[#ff0055]">DECKS</span></h1>
        </div>
        <div className="flex items-center gap-3">
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
            {toolsOpen && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-8 backdrop-blur-sm">
              <div className="bg-[#1a1a20] border border-white/10 rounded-2xl p-8 max-w-5xl w-full max-h-full overflow-y-auto shadow-2xl flex flex-col gap-8 relative">
                <button onClick={() => setToolsOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white text-xl">
                  ✕
                </button>
                <h2 className="text-xl font-bold tracking-widest border-b border-white/10 pb-4">SETTINGS</h2>
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                   {/* Column 1 */}
                   <div className="flex flex-col gap-8">
                       <div>
                           <h3 className="text-xs font-bold tracking-widest text-white/50 mb-4 uppercase">Waveforms</h3>
                           <div className="flex flex-col gap-4">
                               <div className="flex flex-col gap-2">
                                   <label className="text-xs font-mono">Waveform Density</label>
                                   <div className="flex gap-2">
                                     <button onClick={() => setWaveformThickness('solid')} className={`flex-1 text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-colors ${waveformThickness === 'solid' ? 'bg-white/20 border-white text-white' : 'border-white/10 text-white/50 hover:text-white'}`}>Solid (Heavy)</button>
                                     <button onClick={() => setWaveformThickness('thick')} className={`flex-1 text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-colors ${waveformThickness === 'thick' ? 'bg-white/20 border-white text-white' : 'border-white/10 text-white/50 hover:text-white'}`}>Bars (Medium)</button>
                                     <button onClick={() => setWaveformThickness('thin')} className={`flex-1 text-[10px] tracking-wider uppercase py-2 px-2 border rounded transition-colors ${waveformThickness === 'thin' ? 'bg-white/20 border-white text-white' : 'border-white/10 text-white/50 hover:text-white'}`}>Lines (Thin)</button>
                                   </div>
                               </div>
                               <div className="flex flex-col gap-2">
                                   <label className="text-xs font-mono">Global Waveform Height: {waveformHeight}px</label>
                                   <input type="range" min="56" max="300" step="1" value={waveformHeight} onChange={(e) => setWaveformHeight(parseInt(e.target.value))} className="w-full accent-white" />
                               </div>
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
                               <button onClick={() => { setDeckAColor('#00f2ff'); setDeckBColor('#ff0055'); }} className="text-[10px] tracking-wider uppercase py-2 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors">Reset Colors</button>
                           </div>
                       </div>
                   </div>

                   {/* Column 2 */}
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
                           <h3 className="text-xs font-bold tracking-widest text-white/50 mb-4 uppercase">MIDI Control</h3>
                            <div className="flex flex-col gap-4">
                              <div className="text-[10px] font-mono opacity-50 bg-white/5 p-2 rounded">Status: {midiStatus}</div>
                              <button 
                                onClick={checkMidiDevices}
                                className="w-full text-[10px] tracking-wider uppercase py-2 border border-white/20 hover:border-white hover:text-white rounded transition-colors"
                              >
                                Check Devices
                              </button>
                            </div>
                       </div>
                   </div>

                   {/* Column 3: MIDI Mapping DB */}
                   <div className="flex flex-col gap-4 h-[500px]">
                       <h3 className="text-xs font-bold tracking-widest text-white/50 uppercase">MIDI Database</h3>
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
      
      {/* Global Track Progress */}
      <div className="flex w-full shrink-0">
        <OverlayedWaveforms isPlayingA={deckAPlay} isPlayingB={deckBPlay} fileA={deckAFile} fileB={deckBFile} thickness={waveformThickness} colorA={deckAColor} colorB={deckBColor} height={waveformHeight} />
      </div>

      {/* Main Deck Area */}
      <MidiLearnContext.Provider value={{ learnMode: midiLearnMode, activeTarget: activeMidiTarget, setActiveTarget: setActiveMidiTarget }}>
        <main className="flex-1 flex overflow-hidden min-h-0 w-full relative">
        <div 
          className="w-full h-full flex items-center justify-center transition-transform duration-200"
        >
          <div 
            className="flex gap-4 p-4 md:p-8 max-w-7xl mx-auto w-full h-full"
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
              onLoadClick={() => fileInputARef.current?.click()}
              onPlay={() => togglePlay('A')}
              onCue={() => toggleCue('A')}
              onLoop={() => toggleLoop('A')}
              thickness={waveformThickness}
            />

            {/* Mixer */}
            <div className="w-80 shrink-0 bg-neutral-900/50 rounded-2xl border border-white/5 p-6 flex flex-col items-center">
              <h2 className="text-[10px] font-bold tracking-[0.2em] opacity-50 mb-6">MIXER</h2>
              
              <div className="flex-1 flex justify-between w-full px-2 relative">
                
                {/* Deck A Column */}
                <div className="flex flex-col items-center gap-4 h-full">
                  <EqControls deck="A" color={deckAColor} />

                  {/* Deck A Vol */}
                  <div className="flex flex-col items-center mt-auto h-[140px]">
                    <span className="text-[10px] opacity-50 mb-4 font-bold" style={{ color: deckAColor }}>CH A</span>
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
                          className="fader-vertical accent-custom absolute w-[120px] h-3 bg-black border border-white/10 rounded-full"
                          style={{ transform: 'rotate(-90deg)', '--fader-color': deckAColor } as React.CSSProperties}
                        />
                      </div>
                    </MidiControl>
                  </div>
                </div>

                {/* Central VU Meters */}
                <div className="flex flex-col items-center h-full pt-2">
                  <span className="text-[10px] opacity-0 mb-4 font-bold">VU</span>
                  <div className="flex flex-row items-center justify-center gap-4 relative flex-1 w-full pb-4">
                    <div className="flex flex-col items-center h-full gap-2">
                      <VuMeter deck="A" color={deckAColor} />
                      <span className="text-[9px] font-bold opacity-50" style={{ color: deckAColor }}>A</span>
                    </div>
                    <div className="flex flex-col items-center h-full gap-2">
                      <VuMeter deck="B" color={deckBColor} />
                      <span className="text-[9px] font-bold opacity-50" style={{ color: deckBColor }}>B</span>
                    </div>
                  </div>
                </div>

                {/* Deck B Column */}
                <div className="flex flex-col items-center gap-4 h-full">
                  <EqControls deck="B" color={deckBColor} />

                  {/* Deck B Vol */}
                  <div className="flex flex-col items-center mt-auto h-[140px]">
                    <span className="text-[10px] opacity-50 mb-4 font-bold" style={{ color: deckBColor }}>CH B</span>
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
                          className="fader-vertical accent-custom absolute w-[120px] h-3 bg-black border border-white/10 rounded-full"
                          style={{ transform: 'rotate(-90deg)', '--fader-color': deckBColor } as React.CSSProperties}
                        />
                      </div>
                    </MidiControl>
                  </div>
                </div>
                
              </div>

              {/* Crossfader */}
              <div className="w-full mt-6">
                <div className="flex justify-between text-[9px] opacity-40 font-mono mb-2 font-bold">
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
              onLoadClick={() => fileInputBRef.current?.click()}
              onPlay={() => togglePlay('B')}
              onCue={() => toggleCue('B')}
              onLoop={() => toggleLoop('B')}
              thickness={waveformThickness}
            />
          </div>
        </div>
      </main>
      </MidiLearnContext.Provider>

      {/* Media Browser at Bottom */}
      <div className={libraryVisible ? 'block shrink-0' : 'hidden'}>
        <MediaBrowser onLoadToDeck={handleLoadDeck} />
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
    <div className="flex flex-col justify-center gap-4 w-16 items-center shrink-0">
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_EQ_HIGH' : 'DECK_B_EQ_HIGH'}>
        <Knob label="HIGH" value={eqHigh} onChange={(v) => applyEq('high', v)} accent color={color} />
      </MidiControl>
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_EQ_MID' : 'DECK_B_EQ_MID'}>
        <Knob label="MID" value={eqMid} onChange={(v) => applyEq('mid', v)} accent color={color} />
      </MidiControl>
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_EQ_LOW' : 'DECK_B_EQ_LOW'}>
        <Knob label="LOW" value={eqLow} onChange={(v) => applyEq('low', v)} accent color={color} />
      </MidiControl>
      <div className="h-px w-full bg-white/10 my-2" />
      <MidiControl midiKey={deck === 'A' ? 'DECK_A_FILTER' : 'DECK_B_FILTER'}>
        <Knob label="FILTER" value={filter} onChange={applyFilter} accent color={color} />
      </MidiControl>
    </div>
  );
}

function VuMeter({ deck, color }: { deck: 'A' | 'B', color: string }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let animationFrame: number;
    const update = () => {
      const engine = getAudioEngine();
      const target = deck === 'A' ? engine.deckA : engine.deckB;
      setLevel(target.getLevel());
      animationFrame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(animationFrame);
  }, [deck]);

  const segments = 16;
  return (
    <div className="flex flex-col-reverse justify-between h-full w-4 bg-black/40 rounded p-1 border border-white/5 relative">
      {Array.from({ length: segments }).map((_, i) => {
        const threshold = i / segments;
        const isActive = level > threshold;
        const isRed = i >= segments - 2;
        
        let segmentColor = 'bg-white/10';
        if (isActive) {
          segmentColor = isRed ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : `shadow-[0_0_8px_${color}80]`;
        }

        return (
          <div 
            key={i} 
            className={`w-full flex-1 mb-[2px] rounded-sm transition-colors duration-75 ${segmentColor}`}
            style={isActive && !isRed ? { backgroundColor: color } : {}}
          />
        );
      })}
    </div>
  );
}

function Deck({ id, theme, file, isPlaying, isLooping, onLoadClick, onPlay, onCue, onLoop, thickness }: any) {
  const [pitch, setPitch] = useState(0.5);
  const [progress, setProgress] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [rotation, setRotation] = useState(0);
  const [baseBpm, setBaseBpm] = useState(120);

  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const startRotation = useRef(0);

  useEffect(() => {
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    const interval = setInterval(() => {
      const dur = target.duration;
      if (dur > 0) {
        setProgress((target.currentTime / dur) * 100);
        if (!isDragging.current) {
          setRotation((target.currentTime / 1.8) * 360);
        }
      }
      if (target.peaks !== peaks) setPeaks([...target.peaks]);
      if (target.baseBpm !== baseBpm) setBaseBpm(target.baseBpm);
    }, 50);
    return () => clearInterval(interval);
  }, [id, peaks, baseBpm]);

  useEffect(() => {
    const handleMidiUpdate = (e: any) => {
      const { controlName, normalized } = e.detail;
      
      if (id === 'A') {
        if (controlName === 'DECK_A_PITCH') setPitch(normalized);
      } else {
        if (controlName === 'DECK_B_PITCH') setPitch(normalized);
      }
    };
    window.addEventListener('dj-control', handleMidiUpdate);
    return () => window.removeEventListener('dj-control', handleMidiUpdate);
  }, [id]);

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
      // Get other deck's effective rate and BPM
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
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleJogPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const diff = (dx - dy) * 1.5; 
    const newRot = startRotation.current + diff;
    setRotation(newRot);
    
    const engine = getAudioEngine();
    const target = id === 'A' ? engine.deckA : engine.deckB;
    const timeDiff = (diff / 360) * 1.8;
    if (target.duration > 0) {
      target.audioElement.currentTime = Math.max(0, Math.min(target.duration, target.audioElement.currentTime + timeDiff));
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      startRotation.current = newRot;
    }
  };

  const handleJogPointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const currentBpm = (baseBpm * (1.0 + (pitch - 0.5) * 0.32)).toFixed(2);

  const pitchSection = (
    <div className="w-16 flex flex-col items-center justify-end shrink-0 h-full">
      <span className="text-[10px] opacity-50 mb-4 shrink-0 font-bold">PITCH</span>
      <MidiControl midiKey={id === 'A' ? 'DECK_A_PITCH' : 'DECK_B_PITCH'}>
        <div className="flex-1 flex justify-center items-center w-full relative h-[120px]">
          <input 
            type="range" min="0" max="1" step="0.001" 
            value={pitch} 
            onChange={(e) => applyPitch(parseFloat(e.target.value))}
            className="fader-vertical accent-custom absolute w-[120px] h-3 bg-black border border-white/10 rounded-full"
            style={{ transform: 'rotate(-90deg)', '--fader-color': theme } as React.CSSProperties}
          />
        </div>
      </MidiControl>
      <span className="text-[9px] font-mono mt-3 opacity-60 shrink-0 font-bold" style={{ color: pitch !== 0.5 ? theme : 'white' }}>
        {((pitch - 0.5) * 32).toFixed(1)}%
      </span>
    </div>
  );

  return (
    <div className={`flex-1 bg-neutral-900/30 rounded-2xl border p-6 flex flex-col gap-6 relative overflow-hidden h-full transition-all duration-300 ${isPlaying ? 'border-opacity-30 z-10' : 'border-white/5'}`} style={isPlaying ? { borderColor: theme, boxShadow: `0 0 100px ${theme}40, inset 0 0 60px ${theme}20` } : {}}>
      {/* Top Bar (Track Info) */}
      <div className="flex justify-between items-start shrink-0">
        <div className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 cursor-pointer transition-colors flex flex-col gap-2" style={{ borderColor: isPlaying ? theme : undefined }} onClick={onLoadClick}>
          {/* Mini Waveform */}
          <div className="w-full h-12 bg-black/40 border border-white/5 rounded relative overflow-hidden flex shrink-0">
             <div className="absolute inset-0 pointer-events-none opacity-50">
               <WaveformSVG peaks={peaks} color={theme} progress={progress} height={48} thickness={thickness} />
             </div>
             <div className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none" style={{ left: `${progress}%`, backgroundColor: theme, boxShadow: `0 0 10px ${theme}` }} />
          </div>
          <div className="flex justify-between items-center mb-1">
             <div className="text-[10px] tracking-widest font-mono font-bold" style={{ color: theme }}>DECK {id}</div>
             <div className="text-[10px] font-mono tracking-wider opacity-50">BPM <span className="text-white font-bold text-xs">{currentBpm}</span></div>
          </div>
          <div className="font-mono text-sm truncate opacity-90">
            {file ? file.name : "CLICK TO LOAD TRACK"}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between relative z-10 min-h-0">
        
        {/* Jog Wheel */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-2 gap-6 w-full max-w-[400px] mx-auto">
          
          {/* Virtual Jog */}
          <div 
            className={`w-48 h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 xl:w-72 xl:h-72 rounded-full border-4 flex items-center justify-center relative transition-colors duration-500 shrink-0 cursor-grab active:cursor-grabbing ${isPlaying ? 'bg-black/40' : 'border-white/5 bg-black/20'}`} 
            style={isPlaying ? { borderColor: theme, boxShadow: `0 0 100px ${theme}60, inset 0 0 40px ${theme}40` } : {}}
            onPointerDown={handleJogPointerDown}
            onPointerMove={handleJogPointerMove}
            onPointerUp={handleJogPointerUp}
            onPointerCancel={handleJogPointerUp}
          >
            {isPlaying && (
              <div className="absolute inset-0 rounded-full animate-ping opacity-30 pointer-events-none" style={{ backgroundColor: theme, animationDuration: '2s' }} />
            )}
            <div 
              className={`w-40 h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 xl:w-64 xl:h-64 rounded-full border border-dashed ${isPlaying ? 'border-opacity-80' : 'border-white/20'}`} 
              style={{ borderColor: isPlaying ? theme : undefined, transform: `rotate(${rotation}deg)` }}
            >
              <div className="w-2 h-2 rounded-full absolute top-2 left-1/2 -translate-x-1/2" style={{ backgroundColor: theme, boxShadow: `0 0 20px ${theme}` }} />
            </div>
            {/* Center Label */}
            <div className="absolute text-[10px] font-mono opacity-30 text-center pointer-events-none select-none">
              VINYL<br/>CTRL
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="flex justify-center items-end gap-6 h-[160px] shrink-0 pb-2">
          
          {id === 'A' && pitchSection}

          {/* Transport Buttons */}
          <div className="flex gap-4 shrink-0 mb-4 items-center">
            <button 
              onClick={handleSync}
              className="px-4 py-2 h-10 rounded-lg text-xs font-bold font-mono tracking-widest bg-black/40 border border-white/20 hover:border-white/60 transition-colors text-white mr-2"
              title="Sync BPM with other deck"
            >
              SYNC
            </button>
            <MidiControl midiKey={id === 'A' ? 'DECK_A_PLAY_BTN' : 'DECK_B_PLAY_BTN'}>
              <button 
                onClick={onPlay}
                className="w-16 h-16 rounded-xl flex items-center justify-center border-2 transition-all hover:scale-105 active:scale-95"
                style={isPlaying ? { backgroundColor: `${theme}20`, borderColor: theme, color: theme, boxShadow: `0 0 15px ${theme}40` } : { backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current translate-x-[2px]" />}
              </button>
            </MidiControl>
            <MidiControl midiKey={id === 'A' ? 'DECK_A_CUE_BTN' : 'DECK_B_CUE_BTN'}>
              <button 
                onClick={onCue}
                className="w-16 h-16 rounded-xl flex items-center justify-center border-2 bg-black/40 border-white/10 hover:border-white/30 text-white transition-all active:scale-95"
              >
                <span className="font-bold text-[11px] tracking-wider">CUE</span>
              </button>
            </MidiControl>
            <MidiControl midiKey={id === 'A' ? 'DECK_A_LOOP_BTN' : 'DECK_B_LOOP_BTN'}>
              <button 
                onClick={onLoop}
                className={`w-16 h-16 rounded-xl flex items-center justify-center border-2 transition-all hover:scale-105 active:scale-95 ${isLooping ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-black/40 border-white/10 hover:border-white/30 text-white'}`}
              >
                <Repeat className="w-6 h-6" />
              </button>
            </MidiControl>
          </div>

          {id === 'B' && pitchSection}

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

  // Map 0-1 to -135 to 135 deg
  const rotation = -135 + (value * 270);
  
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashLength = circumference * 0.75;
  const strokeDashoffset = circumference - (value * dashLength);

  const isMidiLinked = props['data-midi-linked'];
  const midiTheme = props['data-midi-theme'];

  return (
    <div 
      className={`flex flex-col items-center gap-2 ${className}`} 
      style={style}
      onClickCapture={onClickCapture}
      onMouseDownCapture={onMouseDownCapture}
    >
      <div className={`relative group cursor-pointer w-12 h-12 shrink-0 ${isDragging ? 'scale-105' : ''} transition-transform`}
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
          {/* Empty track */}
          <circle
            cx="24" cy="24" r="22"
            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"
            strokeDasharray={`${dashLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Filled track */}
          <circle
            cx="24" cy="24" r="22"
            fill="none" stroke={accent ? color : '#ffffff'} strokeWidth="3"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ 
              filter: accent ? `drop-shadow(0 0 5px ${color})` : `drop-shadow(0 0 5px rgba(255,255,255,0.7))`
            }}
          />
        </svg>

        {/* Background circle */}
        <div className="absolute inset-1 rounded-full border border-white/10 bg-black/80 shadow-inner" />
        {/* Indicator */}
        <div 
          className="absolute inset-1 rounded-full pointer-events-none"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div 
            className={`w-[3px] h-3 absolute top-1 left-1/2 -translate-x-1/2 rounded-full ${!accent ? 'bg-white' : ''}`}
            style={accent ? { backgroundColor: color, boxShadow: `0 0 8px ${color}` } : {}}
          />
        </div>
      </div>
      <span className="text-[9px] font-bold tracking-wider opacity-50 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
        {label}
      </span>
    </div>
  );
}
