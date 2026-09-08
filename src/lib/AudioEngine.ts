
export class Deck {
  context: AudioContext;
  masterOut: AudioNode;
  
  audioElement: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  
  // Mixer & EQ
  gainNode: GainNode;
  eqHigh: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  filterNode: BiquadFilterNode; // Bipolar HP/LP
  
  // Routing
  deckVolumeNode: GainNode;
  crossfadeNode: GainNode;
  analyzer: AnalyserNode;

  isPlaying = false;
  playbackRate = 1.0;
  private currentUrl: string | null = null;
  
  // Cue & Loop State
  cuePoint: number = 0;
  loopEnabled: boolean = false;
  loopStart: number = 0;
  loopEnd: number = 0;

  constructor(context: AudioContext, masterOut: AudioNode) {
    this.context = context;
    this.masterOut = masterOut;

    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.preservesPitch = false; // Vinyl-like pitch shifting
    
    this.audioElement.addEventListener('play', () => { this.isPlaying = true; });
    this.audioElement.addEventListener('pause', () => { this.isPlaying = false; });
    this.audioElement.addEventListener('ended', () => { this.isPlaying = false; });
    
    // Looping logic handled via timeupdate
    this.audioElement.addEventListener('timeupdate', () => {
      if (this.loopEnabled && this.loopEnd > this.loopStart) {
        if (this.audioElement.currentTime >= this.loopEnd) {
          this.audioElement.currentTime = this.loopStart;
        }
      }
    });

    this.sourceNode = context.createMediaElementSource(this.audioElement);

    // Trim/Gain
    this.gainNode = context.createGain();
    
    // 3-Band EQ
    this.eqHigh = context.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 3200;
    
    this.eqMid = context.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1.0; // Standard Q
    
    this.eqLow = context.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 320;

    // Bipolar Filter (defaults to all-pass essentially by setting frequency out of bounds or gain to 0, but we'll manage it dynamically)
    this.filterNode = context.createBiquadFilter();
    this.filterNode.type = 'lowpass'; // Will change based on knob position
    this.filterNode.frequency.value = 22000; // Open LP

    // Deck Volume Fader & Crossfader
    this.deckVolumeNode = context.createGain();
    this.crossfadeNode = context.createGain();
    
    // Analyzer for visuals (waveform/levels)
    this.analyzer = context.createAnalyser();
    this.analyzer.fftSize = 2048;

    // Signal Chain: Source -> Trim -> EQ -> Filter -> Analyzer -> Fader -> Crossfader -> Master
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.eqHigh);
    this.eqHigh.connect(this.eqMid);
    this.eqMid.connect(this.eqLow);
    this.eqLow.connect(this.filterNode);
    
    // Connect analyzer pre-fader for accurate visual feedback
    this.filterNode.connect(this.analyzer);
    this.analyzer.connect(this.deckVolumeNode);
    
    this.deckVolumeNode.connect(this.crossfadeNode);
    this.crossfadeNode.connect(this.masterOut);
  }

  peaks: number[] = [];
  durationVal: number = 0;
  baseBpm: number = 120;

  async load(file: File) {
    this.stop();
    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
    this.currentUrl = URL.createObjectURL(file);
    this.audioElement.src = this.currentUrl;
    this.audioElement.load();
    this.cuePoint = 0; // Reset cue on load
    this.peaks = [];
    
    try {
      // Decode audio for waveform peaks
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      
      const channelData = audioBuffer.getChannelData(0); // Left channel
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

      // Simple BPM Detection
      const sampleRate = audioBuffer.sampleRate;
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
              i += Math.floor(sampleRate * 0.2 / blockSize); // skip 200ms
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
      console.error("Failed to decode audio", e);
    }
  }

  play() {
    if (this.context.state === 'suspended') this.context.resume();
    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        if (e.name !== 'AbortError') {
          console.error("Playback failed:", e);
        }
      });
    }
  }

  pause() {
    this.audioElement.pause();
  }

  stop() {
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
  }
  
  // Transport & Cue points
  setCuePoint() {
    this.cuePoint = this.audioElement.currentTime;
  }
  
  jumpToCue() {
    this.audioElement.currentTime = this.cuePoint;
    if (!this.isPlaying) {
      this.play();
    }
  }
  
  toggleLoop() {
    this.loopEnabled = !this.loopEnabled;
    if (this.loopEnabled) {
      this.loopStart = this.audioElement.currentTime;
      // Default 4-beat loop roughly (assuming 120bpm for a basic fallback, better to use beatgrid but this is a skeleton)
      this.loopEnd = this.loopStart + 2.0; 
    }
  }

  setTrim(val: number) { // 0 to 1, default 0.5 (unity)
    // 0 = silent, 0.5 = unity (1x), 1.0 = +6dB (2x) roughly
    const gain = val * 2.0; 
    this.gainNode.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
  }

  setVolume(val: number) { // 0 to 1
    this.deckVolumeNode.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setCrossfade(val: number) { // 0 to 1
    this.crossfadeNode.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  setEqHigh(val: number) { // 0 to 1 (0.5 is flat)
    const db = (val - 0.5) * 48; // -24dB to +24dB
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
  
  setFilter(val: number) { // 0 to 1 (0.5 is flat)
    // Bipolar Filter: 
    // < 0.5: Low-Pass (sweeping frequency down)
    // = 0.5: Flat (LP completely open)
    // > 0.5: High-Pass (sweeping frequency up)
    if (val < 0.5) {
      this.filterNode.type = 'lowpass';
      // Map 0 -> 20Hz, 0.5 -> 22000Hz (exponential)
      const normalized = val * 2; // 0 to 1
      const freq = 20 * Math.pow(22000 / 20, normalized);
      this.filterNode.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
    } else if (val > 0.5) {
      this.filterNode.type = 'highpass';
      // Map 0.5 -> 20Hz, 1 -> 22000Hz
      const normalized = (val - 0.5) * 2; // 0 to 1
      const freq = 20 * Math.pow(22000 / 20, normalized);
      this.filterNode.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
    } else {
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setTargetAtTime(22000, this.context.currentTime, 0.01);
    }
  }

  setPitch(val: number) { // 0 to 1, where 0.5 is 1x (normal)
    // Pitch fader usually handles +/- 8% or 16% in standard DJ decks. Let's use +/- 16% for a good range.
    // val 0 = +16%, val 1 = -16% (often faders are inverted physically, but logically 0 to 1)
    // Let's assume 0.5 = 1.0 rate
    const range = 0.16; // 16%
    const normalized = (val - 0.5) * 2; // -1 to +1
    const rate = 1.0 + (normalized * range);
    this.playbackRate = rate;
    this.audioElement.playbackRate = rate;
  }

  get duration() {
    return this.audioElement.duration || 0;
  }
  
  get currentTime() {
    return this.audioElement.currentTime || 0;
  }

  getVisualizerData(dataArray: Uint8Array) {
    if (this.isPlaying) {
      this.analyzer.getByteFrequencyData(dataArray);
    } else {
      dataArray.fill(0);
    }
  }

  getLevel(): number {
    if (!this.isPlaying) return 0;
    const data = new Uint8Array(this.analyzer.frequencyBinCount);
    this.analyzer.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(1, rms * 4); // Scale up a bit for visual
  }
}

export class AudioEngine {
  context: AudioContext;
  deckA: Deck;
  deckB: Deck;
  crossfaderValue = 0.5;
  masterAnalyzer: AnalyserNode;
  masterLimiter: DynamicsCompressorNode;
  masterGain: GainNode;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Master Chain
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1.0;
    
    // Master Limiter to prevent clipping
    this.masterLimiter = this.context.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5; // -0.5 dB
    this.masterLimiter.knee.value = 0.0;
    this.masterLimiter.ratio.value = 20.0; // Hard limiting
    this.masterLimiter.attack.value = 0.005;
    this.masterLimiter.release.value = 0.050;
    
    this.masterAnalyzer = this.context.createAnalyser();
    this.masterAnalyzer.fftSize = 256;
    
    // Connect Master Chain
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyzer);
    this.masterAnalyzer.connect(this.context.destination);

    // Initialize Decks routing to Master Gain
    this.deckA = new Deck(this.context, this.masterGain);
    this.deckB = new Deck(this.context, this.masterGain);
    
    this.updateCrossfader(0.5);
  }

  resume() {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }
  
  setMasterVolume(val: number) { // 0 to 1
    this.masterGain.gain.setTargetAtTime(val, this.context.currentTime, 0.01);
  }

  updateCrossfader(val: number) { // 0 to 1
    this.crossfaderValue = val;
    // Constant power crossfade curve
    // When crossfader is in the middle (0.5), both decks should have Math.cos(0.25 * PI) ~ 0.707 gain (-3dB), which sums to 0dB in uncorrelated signals
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

