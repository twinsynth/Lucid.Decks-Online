// Generates offline synthesized royalty-free DJ demo tracks in memory
// Perfect for static hosts (GitHub Pages) or testing without local audio files

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const numSamples = buffer.length * numChannels;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataByteCount = numSamples * 2;
  const headerByteCount = 44;
  const totalByteCount = headerByteCount + dataByteCount;

  const arrayBuffer = new ArrayBuffer(totalByteCount);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataByteCount, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function generateDemoTrackA(): Promise<File> {
  const bpm = 124;
  const beats = 64; // 16 bars
  const beatSec = 60 / bpm;
  const duration = beats * beatSec;
  const sampleRate = 44100;

  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);

  // Master bus
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // 1. Kick Drum (Punchy 4-on-the-floor)
  for (let b = 0; b < beats; b++) {
    const t = b * beatSec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  // 2. Offbeat Hi-Hats
  const hatBuffer = ctx.createBuffer(1, sampleRate * 0.08, sampleRate);
  const hatData = hatBuffer.getChannelData(0);
  for (let i = 0; i < hatData.length; i++) {
    hatData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.02));
  }

  for (let b = 0; b < beats; b++) {
    const t = b * beatSec + beatSec * 0.5; // Offbeat &
    const hat = ctx.createBufferSource();
    hat.buffer = hatBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;

    const gain = ctx.createGain();
    gain.gain.value = 0.35;

    hat.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    hat.start(t);
  }

  // 3. Claps on 2 and 4
  for (let b = 1; b < beats; b += 2) {
    const t = b * beatSec;
    const clap = ctx.createBufferSource();
    clap.buffer = hatBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.45;

    clap.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    clap.start(t);
  }

  // 4. Synth Bassline (Techno groove in F minor)
  const bassNotes = [43.65, 43.65, 51.91, 48.99]; // F1, F1, Ab1, G1
  for (let b = 0; b < beats; b++) {
    const note = bassNotes[Math.floor(b / 2) % bassNotes.length];
    const t = b * beatSec + beatSec * 0.25; // 16th-note syncopation

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(note, t);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  const renderedBuffer = await ctx.startRendering();
  const wavBlob = audioBufferToWav(renderedBuffer);
  return new File([wavBlob], 'Lucid Horizon - Cyber Beat (124 BPM).wav', { type: 'audio/wav' });
}

export async function generateDemoTrackB(): Promise<File> {
  const bpm = 126;
  const beats = 64; // 16 bars
  const beatSec = 60 / bpm;
  const duration = beats * beatSec;
  const sampleRate = 44100;

  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // 1. Heavy Club Kick
  for (let b = 0; b < beats; b++) {
    const t = b * beatSec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.14);

    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  // 2. Rolling 16th-note Shaker
  const noiseBuffer = ctx.createBuffer(1, sampleRate * 0.05, sampleRate);
  const nData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nData.length; i++) {
    nData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.01));
  }

  for (let i = 0; i < beats * 4; i++) {
    const t = i * (beatSec / 4);
    const shaker = ctx.createBufferSource();
    shaker.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 9000;

    const gain = ctx.createGain();
    const isAccent = i % 4 === 2;
    gain.gain.value = isAccent ? 0.28 : 0.12;

    shaker.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    shaker.start(t);
  }

  // 3. Deep Sub Bass (A minor)
  const bassNotes = [55.0, 55.0, 65.41, 73.42]; // A1, A1, C2, D2
  for (let b = 0; b < beats; b++) {
    const note = bassNotes[Math.floor(b / 4) % bassNotes.length];
    const t = b * beatSec;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + beatSec * 0.85);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + beatSec * 0.9);
  }

  // 4. Melodic Pluck Chords (Minor triad arpeggios)
  const chordNotes = [220, 261.63, 329.63, 392.0]; // A3, C4, E4, G4
  for (let b = 0; b < beats; b += 2) {
    chordNotes.forEach((freq, idx) => {
      const t = b * beatSec + idx * (beatSec * 0.25);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, t);
      filter.frequency.exponentialRampToValueAtTime(400, t + 0.3);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  const renderedBuffer = await ctx.startRendering();
  const wavBlob = audioBufferToWav(renderedBuffer);
  return new File([wavBlob], 'Solar Drift - Neon Groove (126 BPM).wav', { type: 'audio/wav' });
}
