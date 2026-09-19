/**
 * BeatDetector.ts
 * High-accuracy offline BPM and Beatgrid analyzer for Web Audio API.
 * Uses lowpass transient isolation, energy-flux onset detection,
 * autocorrelation, and comb-filter phase detection to compute:
 * 1. Accurate BPM (with sub-integer precision)
 * 2. Downbeat / First Beat Offset (in seconds)
 * 3. High-resolution detailed waveform peaks (100 samples/sec)
 * 4. Standard 1000-point overview peaks
 */

export interface BeatAnalysisResult {
  bpm: number;
  firstBeatOffset: number;
  detailedPeaks: Float32Array;
  overviewPeaks: number[];
}

export function analyzeAudioBuffer(buffer: AudioBuffer): BeatAnalysisResult {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const duration = buffer.duration;

  // 1. Generate High-Resolution Detailed Peaks (100 peaks per second = 10ms bins)
  const peakRate = 100; // 100 Hz
  const detailedBinSize = Math.max(1, Math.floor(sampleRate / peakRate));
  const numDetailedBins = Math.ceil(totalSamples / detailedBinSize);
  const detailedPeaks = new Float32Array(numDetailedBins);

  let globalMax = 0;
  for (let b = 0; b < numDetailedBins; b++) {
    const start = b * detailedBinSize;
    const end = Math.min(start + detailedBinSize, totalSamples);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const absVal = Math.abs(channelData[i]);
      if (absVal > peak) peak = absVal;
    }
    detailedPeaks[b] = peak;
    if (peak > globalMax) globalMax = peak;
  }

  // Normalize detailed peaks
  if (globalMax > 0) {
    for (let b = 0; b < numDetailedBins; b++) {
      detailedPeaks[b] = detailedPeaks[b] / globalMax;
    }
  }

  // 2. Generate 1000-point Overview Peaks for top master visualizer
  const numOverview = 1000;
  const overviewStep = Math.max(1, Math.floor(detailedPeaks.length / numOverview));
  const overviewPeaks: number[] = [];
  for (let i = 0; i < numOverview; i++) {
    const start = i * overviewStep;
    const end = Math.min(start + overviewStep, detailedPeaks.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      if (detailedPeaks[j] > max) max = detailedPeaks[j];
    }
    overviewPeaks.push(max);
  }

  // 3. Low-Pass Filter on Audio Segment for Kick/Bass Transient Detection
  // Analyze up to first 120 seconds where rhythm is established
  const analyzeDuration = Math.min(120, duration);
  const analyzeSamples = Math.floor(analyzeDuration * sampleRate);
  
  // Discrete 2nd-order Butterworth low-pass filter at 160 Hz
  const cutoff = 160;
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const alpha = Math.sin(w0) / (2 * 0.707);
  const cosW0 = Math.cos(w0);

  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const invA0 = 1 / a0;
  const normB0 = b0 * invA0;
  const normB1 = b1 * invA0;
  const normB2 = b2 * invA0;
  const normA1 = a1 * invA0;
  const normA2 = a2 * invA0;

  // Filter and compute energy envelope in 10ms windows (100 Hz envelope)
  const envFrameSize = Math.floor(sampleRate * 0.01); // 10ms
  const numEnvFrames = Math.floor(analyzeSamples / envFrameSize);
  const envelope = new Float32Array(numEnvFrames);

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let f = 0; f < numEnvFrames; f++) {
    let energy = 0;
    const offset = f * envFrameSize;
    for (let i = 0; i < envFrameSize; i++) {
      const x0 = channelData[offset + i];
      const y0 = normB0 * x0 + normB1 * x1 + normB2 * x2 - normA1 * y1 - normA2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      energy += y0 * y0;
    }
    envelope[f] = Math.sqrt(energy / envFrameSize);
  }

  // 4. Half-Wave Rectified Spectral/Energy Flux (Onset Envelope)
  const onsets = new Float32Array(numEnvFrames);
  for (let f = 1; f < numEnvFrames; f++) {
    const diff = envelope[f] - envelope[f - 1];
    onsets[f] = diff > 0 ? diff : 0;
  }

  // Moving average subtraction to highlight sudden transients
  const movingAvgWindow = 20; // 200ms
  for (let f = movingAvgWindow; f < numEnvFrames; f++) {
    let sum = 0;
    for (let k = 1; k <= movingAvgWindow; k++) {
      sum += onsets[f - k];
    }
    const avg = sum / movingAvgWindow;
    onsets[f] = Math.max(0, onsets[f] - avg);
  }

  // 5. Autocorrelation across BPM Range (65 - 185 BPM)
  // Since envelope is 100 Hz (1 frame = 0.01 sec):
  // lag = 60 / (BPM * 0.01) = 6000 / BPM
  const minBpm = 65;
  const maxBpm = 185;
  const minLag = Math.floor(6000 / maxBpm); // ~32
  const maxLag = Math.ceil(6000 / minBpm);  // ~92

  const corr = new Float32Array(maxLag + 1);
  let bestLag = 0;
  let maxCorr = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const count = numEnvFrames - lag;
    for (let i = 0; i < count; i++) {
      sum += onsets[i] * onsets[i + lag];
    }
    corr[lag] = sum / count;
    if (corr[lag] > maxCorr) {
      maxCorr = corr[lag];
      bestLag = lag;
    }
  }

  // If no clear correlation found, default to standard 120 BPM
  if (bestLag === 0 || maxCorr <= 0) {
    return {
      bpm: 120,
      firstBeatOffset: 0,
      detailedPeaks,
      overviewPeaks,
    };
  }

  // Parabolic interpolation around peak lag for fractional precision
  const y_prev = corr[bestLag - 1] || maxCorr;
  const y_curr = corr[bestLag];
  const y_next = corr[bestLag + 1] || maxCorr;
  const denom = y_prev - 2 * y_curr + y_next;
  let exactLag = bestLag;
  if (denom !== 0) {
    const delta = (y_prev - y_next) / (2 * denom);
    exactLag = bestLag + Math.max(-0.5, Math.min(0.5, delta));
  }

  let rawBpm = 6000 / exactLag;

  // Harmonic check: Favor standard DJ dance tempo range (95 - 145 BPM)
  // If detected tempo is ~65-75, check if double tempo (130-150) has strong correlation
  if (rawBpm < 95) {
    const doubleLag = Math.round(exactLag / 2);
    if (doubleLag >= minLag && corr[doubleLag] > maxCorr * 0.65) {
      rawBpm *= 2;
      exactLag /= 2;
    }
  } else if (rawBpm > 155) {
    const halfLag = Math.round(exactLag * 2);
    if (halfLag <= maxLag && corr[halfLag] > maxCorr * 0.8) {
      rawBpm /= 2;
      exactLag *= 2;
    }
  }

  const finalBpm = Math.round(rawBpm * 10) / 10;
  const beatPeriodSeconds = 60 / finalBpm;
  const beatPeriodFrames = exactLag;

  // 6. First Beat Offset (Downbeat / Beatgrid Anchor)
  // Test candidate offsets in [0, beatPeriodFrames) using a comb filter dot product
  const numOffsetSteps = Math.floor(beatPeriodFrames);
  let bestOffsetFrames = 0;
  let maxCombEnergy = -1;

  for (let o = 0; o < numOffsetSteps; o++) {
    let combEnergy = 0;
    for (let k = o; k < numEnvFrames; k += numOffsetSteps) {
      combEnergy += onsets[k];
    }
    if (combEnergy > maxCombEnergy) {
      maxCombEnergy = combEnergy;
      bestOffsetFrames = o;
    }
  }

  const firstBeatOffset = Math.round((bestOffsetFrames * 0.01) * 1000) / 1000;

  return {
    bpm: finalBpm,
    firstBeatOffset: firstBeatOffset % beatPeriodSeconds,
    detailedPeaks,
    overviewPeaks,
  };
}
