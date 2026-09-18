import { registerSoundTouchWorklet } from './SoundTouchWorklet';

export type OutputRoutingMode = 'stereo-sum' | 'split-lr' | '4-channel';

export class Deck {
  context: AudioContext;
  masterOut: AudioNode;
  
  // Decoded Audio Buffer & Source
  audioBuffer: AudioBuffer | null = null;
  workletNode: AudioWorkletNode | null = null;
  bufferSourceNode: AudioBufferSourceNode | null = null;
  audioElement: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null = null;
  useWorklet: boolean = false;
  
  // Mixer & EQ
  gainNode: GainNode;
  eqHigh: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  filterNode: BiquadFilterNode; // Bipolar HP/LP
  
  // Routing & Cueing (PFL)
  deckVolumeNode: GainNode;
  crossfadeNode: GainNode;
  cueGainNode: GainNode; // Pre-fader cue tap
  analyzer: AnalyserNode;

  isPlaying = false;
  isScratching = false;
  playbackRate = 1.0;
  keylock = false; // Master Tempo
  private currentUrl: string | null = null;
  
  // Cue & Loop State
  cuePoint: number = 0;
  hotCues: (number | null)[] = Array(8).fill(null); // 8 colored performance pads
  loopEnabled: boolean = false;
  loopStart: number = 0;
  loopEnd: number = 0;
  isCueActive: boolean = false; // Pre-fade listen headphone cue

  // Time tracking
  private _currentTime: number = 0;
  private _startedAt: number = 0;
  private _startOffset: number = 0;
  private _duration: number = 0;

  peaks: number[] = [];
  durationVal: number = 0;
  baseBpm: number = 120;
  trackId: string | null = null;

  constructor(context: AudioContext, masterOut: AudioNode, cueBus: GainNode) {
    this.context = context;
    this.masterOut = masterOut;

    // Fallback HTMLAudioElement
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.preservesPitch = false;

    // Trim/Gain
    this.gainNode = context.createGain();
    
    // 3-Band EQ
    this.eqHigh = context.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 3200;
    
    this.eqMid = context.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1.0;
    
    this.eqLow = context.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 320;

    // Bipolar Filter
    this.filterNode = context.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 22000;

    // Visual Analyzer (pre-fader)
    this.analyzer = context.createAnalyser();
    this.analyzer.fftSize = 2048;

    // Deck Volume Fader & Crossfader
    this.deckVolumeNode = context.createGain();
    this.crossfadeNode = context.createGain();

    // Pre-fader CUE (PFL) Gain Node -> connected to Headphone Cue Bus
    this.cueGainNode = context.createGain();
    this.cueGainNode.gain.value = 0; // Off by default

    // Signal Chain: Input -> Trim -> EQ High -> EQ Mid -> EQ Low -> Filter -> Analyzer
    this.gainNode.connect(this.eqHigh);
    this.eqHigh.connect(this.eqMid);
    this.eqMid.connect(this.eqLow);
    this.eqLow.connect(this.filterNode);
    this.filterNode.connect(this.analyzer);

    // Pre-fader taps:
    // 1. To Deck Volume Fader -> Crossfader -> Master Out
    this.analyzer.connect(this.deckVolumeNode);
    this.deckVolumeNode.connect(this.crossfadeNode);
    this.crossfadeNode.connect(this.masterOut);

    // 2. To PFL Cue Gain Node -> Cue Bus (Pre-fader!)
    this.analyzer.connect(this.cueGainNode);
    this.cueGainNode.connect(cueBus);
  }

  async load(file: File | Blob, trackId?: string, initialHotCues?: (number | null)[]) {
    this.stop();
    this.trackId = trackId || (file instanceof File ? file.name : null);
    if (initialHotCues) {
      this.hotCues = Array.from({ length: 8 }, (_, i) => initialHotCues[i] ?? null);
    } else {
      this.hotCues = Array(8).fill(null);
    }

    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
    this.currentUrl = URL.createObjectURL(file);
    this.cuePoint = 0;
    this.peaks = [];
    this._currentTime = 0;
    this._startOffset = 0;

    try {
      // Decode audio for sample-accurate playback and waveform/BPM analysis
      const arrayBuffer = await file.arrayBuffer();
      this.audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this._duration = this.audioBuffer.duration;
      this.durationVal = this._duration;

      // Try setting up SoundTouch worklet for Keylock and sample-accurate looping
      const registered = await registerSoundTouchWorklet(this.context);
      if (registered && 'AudioWorkletNode' in window) {
        if (this.workletNode) {
          try { this.workletNode.disconnect(); } catch {}
        }
        this.workletNode = new AudioWorkletNode(this.context, 'soundtouch-processor');
        this.workletNode.connect(this.gainNode);
        
        const ch0 = this.audioBuffer.getChannelData(0);
        const ch1 = this.audioBuffer.numberOfChannels > 1 ? this.audioBuffer.getChannelData(1) : ch0;
        
        this.workletNode.port.postMessage({
          type: 'load',
          channels: [ch0, ch1],
          sampleRate: this.audioBuffer.sampleRate
        });

        this.workletNode.port.onmessage = (e) => {
          if (e.data.type === 'timeUpdate') {
            this._currentTime = e.data.currentTime;
            this._startOffset = e.data.currentTime;
            this._startedAt = this.context.currentTime;
          } else if (e.data.type === 'ended') {
            this.isPlaying = false;
          }
        };

        this.useWorklet = true;
      } else {
        this.useWorklet = false;
      }

      // Generate Waveform Peaks
      const channelData = this.audioBuffer.getChannelData(0);
      const numPeaks = 1000;
      const step = Math.ceil(channelData.length / numPeaks);
      
      const tempPeaks = [];
      let maxPeak = 0;
      for (let i = 0; i < numPeaks; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const idx = (i * step) + j;
          if (idx < channelData.length) {
            const datum = channelData[idx];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
        }
        const peak = Math.max(Math.abs(min), Math.abs(max));
        if (peak > maxPeak) maxPeak = peak;
        tempPeaks.push(peak);
      }
      this.peaks = tempPeaks.map(p => maxPeak > 0 ? p / maxPeak : 0);

      // BPM Detection
      const sampleRate = this.audioBuffer.sampleRate;
      const blockSize = Math.floor(sampleRate * 0.01);
      const blocks = [];
      for (let i = 0; i < channelData.length; i += blockSize) {
        let sum = 0;
        for (let j = 0; j < blockSize && i + j < channelData.length; j++) {
          sum += Math.abs(channelData[i + j]);
        }
        blocks.push(sum);
      }
      const sorted = [...blocks].sort((a,b) => b-a);
      const threshold = sorted[Math.floor(sorted.length * 0.05)] || 0.1;
      const detectedPeaks = [];
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] > threshold) {
          detectedPeaks.push(i * blockSize);
          i += Math.floor(sampleRate * 0.2 / blockSize);
        }
      }
      const intervals: Record<number, number> = {};
      for (let i = 0; i < detectedPeaks.length; i++) {
        for (let j = 1; j < 5 && i + j < detectedPeaks.length; j++) {
          const interval = detectedPeaks[i+j] - detectedPeaks[i];
          const bpm = Math.round(60 / (interval / sampleRate));
          if (bpm >= 70 && bpm <= 180) {
            intervals[bpm] = (intervals[bpm] || 0) + 1;
          }
        }
      }
      let maxCount = 0;
      let detectedBPM = 120;
      for (const bpm in intervals) {
        if (intervals[bpm] > maxCount) {
          maxCount = intervals[bpm];
          detectedBPM = parseInt(bpm);
        }
      }
      this.baseBpm = detectedBPM;

    } catch (e) {
      console.error("Failed to decode audio into buffer:", e);
      // Fallback to HTML audio element
      this.audioElement.src = this.currentUrl;
      this.audioElement.load();
    }
  }

  play() {
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
    if (!this.audioBuffer) return;

    this.isPlaying = true;
    this._startedAt = this.context.currentTime;
    this._startOffset = this._currentTime;

    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setRate',
        rate: this.playbackRate,
        keylock: this.keylock
      });
      this.workletNode.port.postMessage({
        type: 'setLoop',
        enabled: this.loopEnabled,
        start: this.loopStart,
        end: this.loopEnd
      });
      this.workletNode.port.postMessage({ type: 'play' });
    } else {
      // Native AudioBufferSourceNode sample-accurate playback
      this.startBufferSource(this._currentTime);
    }
  }

  private startBufferSource(offset: number) {
    if (!this.audioBuffer) return;
    if (this.bufferSourceNode) {
      try {
        this.bufferSourceNode.onended = null;
        this.bufferSourceNode.stop();
        this.bufferSourceNode.disconnect();
      } catch {}
    }

    this.bufferSourceNode = this.context.createBufferSource();
    this.bufferSourceNode.buffer = this.audioBuffer;
    this.bufferSourceNode.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime);

    // Native sample-accurate looping
    if (this.loopEnabled && this.loopEnd > this.loopStart) {
      this.bufferSourceNode.loop = true;
      this.bufferSourceNode.loopStart = this.loopStart;
      this.bufferSourceNode.loopEnd = this.loopEnd;
    } else {
      this.bufferSourceNode.loop = false;
    }

    this.bufferSourceNode.connect(this.gainNode);
    this.bufferSourceNode.onended = () => {
      if (!this.loopEnabled && this.currentTime >= this.duration) {
        this.isPlaying = false;
      }
    };

    const clampedOffset = Math.max(0, Math.min(this.duration, offset));
    this.bufferSourceNode.start(0, clampedOffset);
  }

  pause() {
    if (!this.isPlaying) return;
    this._currentTime = this.currentTime;
    this.isPlaying = false;

    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'pause' });
    } else if (this.bufferSourceNode) {
      try {
        this.bufferSourceNode.stop();
        this.bufferSourceNode.disconnect();
        this.bufferSourceNode = null;
      } catch {}
    }
  }

  stop() {
    this.pause();
    this.seek(0);
  }

  seek(time: number) {
    const target = Math.max(0, Math.min(this.duration, time));
    this._currentTime = target;
    this._startOffset = target;
    this._startedAt = this.context.currentTime;

    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'seek', time: target });
    } else if (this.isPlaying) {
      this.startBufferSource(target);
    }
  }

  // Standard Cue
  setCuePoint() {
    this.cuePoint = this.currentTime;
  }
  
  jumpToCue() {
    this.seek(this.cuePoint);
    if (!this.isPlaying) {
      this.play();
    }
  }

  // 4 Hot Cues (instantaneous beat jump / cue juggling)
  setHotCue(index: number, time?: number): number {
    if (index < 0 || index > 3) return 0;
    const targetTime = time !== undefined ? time : this.currentTime;
    this.hotCues[index] = targetTime;
    return targetTime;
  }

  jumpToHotCue(index: number) {
    if (index < 0 || index > 3) return;
    const cueTime = this.hotCues[index];
    if (cueTime === null || cueTime === undefined) {
      // If empty, set current time as hot cue
      this.setHotCue(index);
      return;
    }
    // Instantaneous sample-accurate jump
    this.seek(cueTime);
    if (!this.isPlaying) {
      this.play();
    }
  }

  clearHotCue(index: number) {
    if (index < 0 || index > 3) return;
    this.hotCues[index] = null;
  }

  // Sample-Accurate Looping
  toggleLoop(beats: number = 4) {
    this.setLoop(!this.loopEnabled, beats);
  }

  setLoop(enabled: boolean, beats: number = 4) {
    this.loopEnabled = enabled;
    if (this.loopEnabled) {
      this.loopStart = this.currentTime;
      // Calculate loop length based on detected BPM
      const secondsPerBeat = 60.0 / (this.baseBpm || 120);
      this.loopEnd = Math.min(this.duration, this.loopStart + (beats * secondsPerBeat));
    }

    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setLoop',
        enabled: this.loopEnabled,
        start: this.loopStart,
        end: this.loopEnd
      });
    } else if (this.bufferSourceNode && this.isPlaying) {
      // Native Web Audio loop update on active source
      if (this.loopEnabled && this.loopEnd > this.loopStart) {
        this.bufferSourceNode.loop = true;
        this.bufferSourceNode.loopStart = this.loopStart;
        this.bufferSourceNode.loopEnd = this.loopEnd;
      } else {
        this.bufferSourceNode.loop = false;
      }
    }
  }

  // Master Tempo / Keylock
  setKeylock(enabled: boolean) {
    this.keylock = enabled;
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setRate',
        rate: this.playbackRate,
        keylock: this.keylock
      });
    } else if (this.bufferSourceNode && this.isPlaying) {
      // If keylock toggled without worklet, re-sync pitch
      this.bufferSourceNode.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime);
    }
  }

  setPitch(val: number) {
    // 0 to 1 fader range -> +/- 16% playback rate
    const range = 0.16;
    const normalized = (val - 0.5) * 2;
    const rate = 1.0 + (normalized * range);
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));

    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setRate',
        rate: this.playbackRate,
        keylock: this.keylock
      });
    } else if (this.bufferSourceNode && this.isPlaying) {
      this.bufferSourceNode.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime);
    }
  }

  jogNudge(factor: number) {
    const nudged = Math.max(0.2, Math.min(3.0, this.playbackRate * factor));
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setRate',
        rate: nudged,
        keylock: this.keylock
      });
    } else if (this.bufferSourceNode && this.isPlaying) {
      this.bufferSourceNode.playbackRate.setValueAtTime(nudged, this.context.currentTime);
    }
  }

  restoreRate() {
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setRate',
        rate: this.playbackRate,
        keylock: this.keylock
      });
    } else if (this.bufferSourceNode && this.isPlaying) {
      this.bufferSourceNode.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime);
    }
  }

  // Real-Time Vinyl Scratch Mode
  startScratch() {
    this.isScratching = true;
    if (this.isPlaying) {
      this._currentTime = this.currentTime;
      this.isPlaying = false;
    }
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'scratchStart' });
    } else if (this.bufferSourceNode) {
      try {
        this.bufferSourceNode.stop();
        this.bufferSourceNode.disconnect();
        this.bufferSourceNode = null;
      } catch {}
    }
  }

  scratchMove(velocity: number, timeDiff?: number) {
    if (timeDiff !== undefined && this.duration > 0) {
      this._currentTime = Math.max(0, Math.min(this.duration, this._currentTime + timeDiff));
      this._startOffset = this._currentTime;
      this._startedAt = this.context.currentTime;
    }
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'scratchMove',
        velocity
      });
    } else {
      this.seek(this._currentTime);
    }
  }

  endScratch(resume: boolean = false) {
    this.isScratching = false;
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'scratchEnd',
        resume
      });
    }
    if (resume) {
      this.isPlaying = true;
      this._startedAt = this.context.currentTime;
      this._startOffset = this._currentTime;
      if (!this.useWorklet) {
        this.play();
      }
    } else {
      this.isPlaying = false;
    }
  }

  // Pre-Fade Listen (PFL) Headphone CUE
  setCue(enabled: boolean) {
    this.isCueActive = enabled;
    const targetGain = enabled ? 1.0 : 0.0;
    this.cueGainNode.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.01);
  }

  // Mixer Controls
  setTrim(val: number) {
    const gain = val * 2.0;
    this.gainNode.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
  }

  setVolume(val: number) {
    this.deckVolumeNode.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setCrossfade(val: number) {
    this.crossfadeNode.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setEqHigh(val: number) {
    const db = (val - 0.5) * 48;
    this.eqHigh.gain.setTargetAtTime(db, this.context.currentTime, 0.01);
  }

  setEqMid(val: number) {
    const db = (val - 0.5) * 48;
    this.eqMid.gain.setTargetAtTime(db, this.context.currentTime, 0.01);
  }

  setEqLow(val: number) {
    const db = (val - 0.5) * 48;
    this.eqLow.gain.setTargetAtTime(db, this.context.currentTime, 0.01);
  }
  
  setFilter(val: number) {
    if (val < 0.5) {
      this.filterNode.type = 'lowpass';
      const normalized = val * 2;
      const freq = 20 * Math.pow(22000 / 20, normalized);
      this.filterNode.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
    } else if (val > 0.5) {
      this.filterNode.type = 'highpass';
      const normalized = (val - 0.5) * 2;
      const freq = 20 * Math.pow(22000 / 20, normalized);
      this.filterNode.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
    } else {
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setTargetAtTime(22000, this.context.currentTime, 0.01);
    }
  }

  get duration(): number {
    return this._duration || (this.audioBuffer ? this.audioBuffer.duration : 0);
  }
  
  get currentTime(): number {
    if (!this.isPlaying) return this._currentTime;

    // Accurate calculation for smooth 60fps playhead (both worklet and buffer source)
    const elapsed = (this.context.currentTime - this._startedAt) * this.playbackRate;
    let pos = this._startOffset + elapsed;
    if (this.loopEnabled && this.loopEnd > this.loopStart) {
      const loopLen = this.loopEnd - this.loopStart;
      if (pos >= this.loopStart) {
        pos = this.loopStart + ((pos - this.loopStart) % loopLen);
      }
    }
    return Math.min(pos, this.duration);
  }

  getVisualizerData(dataArray: Uint8Array) {
    if (this.isPlaying || this.isScratching) {
      this.analyzer.getByteFrequencyData(dataArray);
    } else {
      dataArray.fill(0);
    }
  }

  getLevel(): number {
    if (!this.isPlaying && !this.isScratching) return 0;
    const data = new Uint8Array(this.analyzer.frequencyBinCount);
    this.analyzer.getByteTimeDomainData(data);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs((data[i] - 128) / 128);
      if (v > peak) peak = v;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    
    // Pro DJ Meter Ballistics: Combine fast transient peak with musical RMS body
    const combined = Math.max(peak * 0.75, rms * 1.5);
    if (combined < 0.005) return 0;

    // Decibel scale: -42 dBFS noise floor up to 0 dBFS full scale
    const dB = 20 * Math.log10(combined);
    const minDb = -42;
    if (dB <= minDb) return 0;

    const norm = (dB - minDb) / (0 - minDb);
    // Perceptual curve: nominal mastering level sits in yellow 0 dBu (~0.68 - 0.78),
    // kick transients hit orange (+3/+6 dBu), clipping triggers red CLIP (>0.94).
    return Math.max(0, Math.min(1.0, Math.pow(norm, 1.15)));
  }
}

export class AudioEngine {
  context: AudioContext;
  deckA: Deck;
  deckB: Deck;
  crossfaderValue = 0.5;

  // Master Chain
  masterGain: GainNode;
  masterLimiter: DynamicsCompressorNode;
  masterAnalyzer: AnalyserNode;

  // Pre-Fade Listen (PFL) Headphone Cue Chain
  cueBus: GainNode;
  cueMasterGain: GainNode;
  cueMixGain: GainNode; // Bleeds Master into Cue headphones
  cueAnalyzer: AnalyserNode;

  // Output Routing
  outputMode: OutputRoutingMode = 'stereo-sum';
  mergerNode: ChannelMergerNode | null = null;
  masterMonoNode: GainNode | null = null;
  cueMonoNode: GainNode | null = null;
  maxChannels: number = 2;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.maxChannels = this.context.destination.maxChannelCount || 2;

    // Master Chain Nodes
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1.0;
    
    this.masterLimiter = this.context.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5;
    this.masterLimiter.knee.value = 0.0;
    this.masterLimiter.ratio.value = 20.0;
    this.masterLimiter.attack.value = 0.005;
    this.masterLimiter.release.value = 0.050;
    
    this.masterAnalyzer = this.context.createAnalyser();
    this.masterAnalyzer.fftSize = 256;

    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyzer);

    // Headphone Cue (PFL) Chain Nodes
    this.cueBus = this.context.createGain();
    this.cueBus.gain.value = 1.0;

    this.cueMasterGain = this.context.createGain();
    this.cueMasterGain.gain.value = 0.8; // 80% headphone vol

    this.cueMixGain = this.context.createGain();
    this.cueMixGain.gain.value = 0.0; // 100% cue, 0% master mix initially

    this.cueAnalyzer = this.context.createAnalyser();
    this.cueAnalyzer.fftSize = 256;

    // Cue Bus connects to Cue Master Gain
    this.cueBus.connect(this.cueMasterGain);
    // Master signal bleeds into Cue Master Gain according to cueMixGain
    this.masterGain.connect(this.cueMixGain);
    this.cueMixGain.connect(this.cueMasterGain);
    this.cueMasterGain.connect(this.cueAnalyzer);

    // Initialize Decks routing to Master and Cue Bus
    this.deckA = new Deck(this.context, this.masterGain, this.cueBus);
    this.deckB = new Deck(this.context, this.masterGain, this.cueBus);
    
    this.updateCrossfader(0.5);
    this.setupOutputRouting('stereo-sum');
  }

  setupOutputRouting(mode: OutputRoutingMode) {
    this.outputMode = mode;

    // Disconnect existing routing
    try { this.masterAnalyzer.disconnect(); } catch {}
    try { this.cueAnalyzer.disconnect(); } catch {}
    if (this.mergerNode) {
      try { this.mergerNode.disconnect(); } catch {}
      this.mergerNode = null;
    }

    if (mode === '4-channel' && this.maxChannels >= 4) {
      // 4-Channel Mode: Ch 1-2 = Master, Ch 3-4 = Headphones
      try {
        this.context.destination.channelCount = 4;
        this.context.destination.channelCountMode = 'explicit';
      } catch (e) {
        console.warn("Could not set 4-channel mode:", e);
      }

      this.mergerNode = this.context.createChannelMerger(4);
      
      const masterSplitter = this.context.createChannelSplitter(2);
      this.masterAnalyzer.connect(masterSplitter);
      masterSplitter.connect(this.mergerNode, 0, 0); // Master L -> Out 1
      masterSplitter.connect(this.mergerNode, 1, 1); // Master R -> Out 2

      const cueSplitter = this.context.createChannelSplitter(2);
      this.cueAnalyzer.connect(cueSplitter);
      cueSplitter.connect(this.mergerNode, 0, 2); // Cue L -> Out 3
      cueSplitter.connect(this.mergerNode, 1, 3); // Cue R -> Out 4

      this.mergerNode.connect(this.context.destination);

    } else if (mode === 'split-lr') {
      // Split Stereo Mode: Left = Master (mono), Right = Cue (mono)
      this.mergerNode = this.context.createChannelMerger(2);

      // Downmix master to mono for Left output
      const masterMono = this.context.createGain();
      masterMono.gain.value = 0.7;
      this.masterAnalyzer.connect(masterMono);
      masterMono.connect(this.mergerNode, 0, 0); // Left

      // Downmix cue to mono for Right output
      const cueMono = this.context.createGain();
      cueMono.gain.value = 0.7;
      this.cueAnalyzer.connect(cueMono);
      cueMono.connect(this.mergerNode, 0, 1); // Right

      this.mergerNode.connect(this.context.destination);

    } else {
      // Stereo Sum / Preview Mode (Standard Laptop / Desktop)
      this.masterAnalyzer.connect(this.context.destination);
      this.cueAnalyzer.connect(this.context.destination);
    }
  }

  resume() {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }
  
  setMasterVolume(val: number) {
    this.masterGain.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setCueVolume(val: number) {
    this.cueMasterGain.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setCueMix(val: number) {
    // 0 = 100% Cue, 1 = 100% Master
    const cueVol = Math.cos(val * 0.5 * Math.PI);
    const masterVol = Math.cos((1.0 - val) * 0.5 * Math.PI);
    this.cueBus.gain.setTargetAtTime(cueVol, this.context.currentTime, 0.01);
    this.cueMixGain.gain.setTargetAtTime(masterVol, this.context.currentTime, 0.01);
  }

  toggleCueA() {
    this.deckA.setCue(!this.deckA.isCueActive);
  }

  toggleCueB() {
    this.deckB.setCue(!this.deckB.isCueActive);
  }

  updateCrossfader(val: number) {
    this.crossfaderValue = val;
    const gainA = Math.cos(val * 0.5 * Math.PI);
    const gainB = Math.cos((1.0 - val) * 0.5 * Math.PI);
    
    this.deckA.setCrossfade(gainA);
    this.deckB.setCrossfade(gainB);
  }
}

let engineInstance: AudioEngine | null = null;
export function getAudioEngine() {
  if (!engineInstance) {
    engineInstance = new AudioEngine();
  }
  return engineInstance;
}
