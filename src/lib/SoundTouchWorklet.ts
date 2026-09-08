// SoundTouch AudioWorklet for Real-Time Time-Stretching (Keylock) and Sample-Accurate Looping

export const SOUNDTOUCH_WORKLET_CODE = `
class FifoSampleBuffer {
  constructor() {
    this._vector = new Float32Array();
    this._position = 0;
    this._frameCount = 0;
  }
  get vector() { return this._vector; }
  get position() { return this._position; }
  get startIndex() { return this._position * 2; }
  get frameCount() { return this._frameCount; }
  get endIndex() { return (this._position + this._frameCount) * 2; }
  clear() {
    this._vector.fill(0);
    this._position = 0;
    this._frameCount = 0;
  }
  put(numFrames) { this._frameCount += numFrames; }
  putSamples(samples, position, numFrames = 0) {
    position = position || 0;
    const sourceOffset = position * 2;
    if (!(numFrames >= 0)) {
      numFrames = (samples.length - sourceOffset) / 2;
    }
    const numSamples = numFrames * 2;
    this.ensureCapacity(numFrames + this._frameCount);
    const destOffset = this.endIndex;
    this._vector.set(samples.subarray(sourceOffset, sourceOffset + numSamples), destOffset);
    this._frameCount += numFrames;
  }
  receive(numFrames) {
    if (!(numFrames >= 0) || numFrames > this._frameCount) {
      numFrames = this._frameCount;
    }
    this._frameCount -= numFrames;
    this._position += numFrames;
  }
  receiveSamples(output, numFrames = 0) {
    const numSamples = numFrames * 2;
    const sourceOffset = this.startIndex;
    output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
    this.receive(numFrames);
  }
  extract(output, position = 0, numFrames = 0) {
    const sourceOffset = this.startIndex + position * 2;
    const numSamples = numFrames * 2;
    output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
  }
  ensureCapacity(numFrames = 0) {
    const minLength = parseInt(numFrames * 2);
    if (this._vector.length < minLength) {
      const newVector = new Float32Array(minLength);
      newVector.set(this._vector.subarray(this.startIndex, this.endIndex));
      this._vector = newVector;
      this._position = 0;
    } else {
      this.rewind();
    }
  }
  ensureAdditionalCapacity(numFrames = 0) {
    this.ensureCapacity(this._frameCount + numFrames);
  }
  rewind() {
    if (this._position > 0) {
      this._vector.set(this._vector.subarray(this.startIndex, this.endIndex));
      this._position = 0;
    }
  }
}

class AbstractFifoSamplePipe {
  constructor(createBuffers) {
    if (createBuffers) {
      this._inputBuffer = new FifoSampleBuffer();
      this._outputBuffer = new FifoSampleBuffer();
    } else {
      this._inputBuffer = this._outputBuffer = null;
    }
  }
  get inputBuffer() { return this._inputBuffer; }
  set inputBuffer(inputBuffer) { this._inputBuffer = inputBuffer; }
  get outputBuffer() { return this._outputBuffer; }
  set outputBuffer(outputBuffer) { this._outputBuffer = outputBuffer; }
  clear() {
    if (this._inputBuffer) this._inputBuffer.clear();
    if (this._outputBuffer) this._outputBuffer.clear();
  }
}

class RateTransposer extends AbstractFifoSamplePipe {
  constructor(createBuffers) {
    super(createBuffers);
    this.reset();
    this._rate = 1;
  }
  set rate(rate) { this._rate = rate; }
  reset() {
    this.slopeCount = 0;
    this.prevSampleL = 0;
    this.prevSampleR = 0;
  }
  clear() {
    super.clear();
    this.reset();
  }
  process() {
    const numFrames = this._inputBuffer.frameCount;
    this._outputBuffer.ensureAdditionalCapacity(numFrames / this._rate + 1);
    const numFramesOutput = this.transpose(numFrames);
    this._inputBuffer.receive();
    this._outputBuffer.put(numFramesOutput);
  }
  transpose(numFrames = 0) {
    if (numFrames === 0) return 0;
    const src = this._inputBuffer.vector;
    const srcOffset = this._inputBuffer.startIndex;
    const dest = this._outputBuffer.vector;
    const destOffset = this._outputBuffer.endIndex;
    let used = 0;
    let i = 0;
    while (this.slopeCount < 1.0) {
      dest[destOffset + 2 * i] = (1.0 - this.slopeCount) * this.prevSampleL + this.slopeCount * src[srcOffset];
      dest[destOffset + 2 * i + 1] = (1.0 - this.slopeCount) * this.prevSampleR + this.slopeCount * src[srcOffset + 1];
      i = i + 1;
      this.slopeCount += this._rate;
    }
    this.slopeCount -= 1.0;
    if (numFrames !== 1) {
      out: while (true) {
        while (this.slopeCount > 1.0) {
          this.slopeCount -= 1.0;
          used = used + 1;
          if (used >= numFrames - 1) break out;
        }
        const srcIndex = srcOffset + 2 * used;
        dest[destOffset + 2 * i] = (1.0 - this.slopeCount) * src[srcIndex] + this.slopeCount * src[srcIndex + 2];
        dest[destOffset + 2 * i + 1] = (1.0 - this.slopeCount) * src[srcIndex + 1] + this.slopeCount * src[srcIndex + 3];
        i = i + 1;
        this.slopeCount += this._rate;
      }
    }
    this.prevSampleL = src[srcOffset + 2 * numFrames - 2];
    this.prevSampleR = src[srcOffset + 2 * numFrames - 1];
    return i;
  }
}

class FilterSupport {
  constructor(pipe) { this._pipe = pipe; }
  get pipe() { return this._pipe; }
  get inputBuffer() { return this._pipe.inputBuffer; }
  get outputBuffer() { return this._pipe.outputBuffer; }
  fillOutputBuffer(numFrames = 0) {
    while (this.outputBuffer.frameCount < numFrames) {
      const numInputFrames = 8192 * 2 - this.inputBuffer.frameCount;
      this.fillInputBuffer(numInputFrames);
      if (this.inputBuffer.frameCount < 8192 * 2) break;
      this._pipe.process();
    }
  }
  clear() { this._pipe.clear(); }
}

class SimpleFilter extends FilterSupport {
  constructor(sourceSound, pipe) {
    super(pipe);
    this.sourceSound = sourceSound;
    this.historyBufferSize = 22050;
    this._sourcePosition = 0;
    this.outputBufferPosition = 0;
    this._position = 0;
  }
  get sourcePosition() { return this._sourcePosition; }
  get position() { return this._position; }
  set sourcePosition(sourcePosition) {
    this.clear();
    this._sourcePosition = Math.max(0, sourcePosition);
    this._position = this._sourcePosition;
  }
  fillInputBuffer(numFrames = 0) {
    const samples = new Float32Array(numFrames * 2);
    const numFramesExtracted = this.sourceSound.extract(samples, numFrames, this._sourcePosition);
    this._sourcePosition += numFramesExtracted;
    this.inputBuffer.putSamples(samples, 0, numFramesExtracted);
  }
  extract(target, numFrames = 0) {
    this.fillOutputBuffer(this.outputBufferPosition + numFrames);
    const numFramesExtracted = Math.min(numFrames, this.outputBuffer.frameCount - this.outputBufferPosition);
    this.outputBuffer.extract(target, this.outputBufferPosition, numFramesExtracted);
    const currentFrames = this.outputBufferPosition + numFramesExtracted;
    this.outputBufferPosition = Math.min(this.historyBufferSize, currentFrames);
    this.outputBuffer.receive(Math.max(currentFrames - this.historyBufferSize, 0));
    this._position += numFramesExtracted;
    return numFramesExtracted;
  }
  clear() {
    super.clear();
    this.outputBufferPosition = 0;
  }
}

const DEFAULT_OVERLAP_MS = 8;
const _SCAN_OFFSETS = [
  [124, 186, 248, 310, 372, 434, 496, 558, 620, 682, 744, 806, 868, 930, 992, 1054, 1116, 1178, 1240, 1302, 1364, 1426, 1488, 0],
  [-100, -75, -50, -25, 25, 50, 75, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-20, -15, -10, -5, 5, 10, 15, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-4, -3, -2, -1, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
];
const AUTOSEQ_TEMPO_LOW = 0.25;
const AUTOSEQ_TEMPO_TOP = 4.0;
const AUTOSEQ_AT_MIN = 125.0;
const AUTOSEQ_AT_MAX = 50.0;
const AUTOSEQ_K = (AUTOSEQ_AT_MAX - AUTOSEQ_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
const AUTOSEQ_C = AUTOSEQ_AT_MIN - AUTOSEQ_K * AUTOSEQ_TEMPO_LOW;
const AUTOSEEK_AT_MIN = 25.0;
const AUTOSEEK_AT_MAX = 15.0;
const AUTOSEEK_K = (AUTOSEEK_AT_MAX - AUTOSEEK_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
const AUTOSEEK_C = AUTOSEEK_AT_MIN - AUTOSEEK_K * AUTOSEQ_TEMPO_LOW;

class Stretch extends AbstractFifoSamplePipe {
  constructor(createBuffers) {
    super(createBuffers);
    this._quickSeek = true;
    this.midBuffer = null;
    this.overlapLength = 0;
    this._tempo = 1;
    this.setParameters(44100, 0, 0, DEFAULT_OVERLAP_MS);
  }
  clear() {
    super.clear();
    this.clearMidBuffer();
  }
  clearMidBuffer() {
    this.midBuffer = null;
    if (this.refMidBuffer) this.refMidBuffer.fill(0);
    this.skipFract = 0;
  }
  setParameters(sampleRate, sequenceMs, seekWindowMs, overlapMs) {
    this.sampleRate = sampleRate || 44100;
    this.overlapMs = overlapMs || DEFAULT_OVERLAP_MS;
    this.calculateSequenceParameters();
    this.calculateOverlapLength(this.overlapMs);
    this.tempo = this._tempo;
  }
  set tempo(newTempo) {
    this._tempo = newTempo;
    this.calculateSequenceParameters();
    this.nominalSkip = this._tempo * (this.seekWindowLength - this.overlapLength);
    this.skipFract = 0;
    const intskip = Math.floor(this.nominalSkip + 0.5);
    this.sampleReq = Math.max(intskip + this.overlapLength, this.seekWindowLength) + this.seekLength;
  }
  get tempo() { return this._tempo; }
  calculateOverlapLength(overlapInMsec = 0) {
    let newOvl = this.sampleRate * overlapInMsec / 1000;
    newOvl = newOvl < 16 ? 16 : newOvl;
    newOvl -= newOvl % 8;
    this.overlapLength = newOvl;
    this.refMidBuffer = new Float32Array(this.overlapLength * 2);
    this.midBuffer = new Float32Array(this.overlapLength * 2);
  }
  calculateSequenceParameters() {
    let seq = AUTOSEQ_C + AUTOSEQ_K * this._tempo;
    seq = Math.max(AUTOSEQ_AT_MAX, Math.min(AUTOSEQ_AT_MIN, seq));
    this.sequenceMs = Math.floor(seq + 0.5);

    let seek = AUTOSEEK_C + AUTOSEEK_K * this._tempo;
    seek = Math.max(AUTOSEEK_AT_MAX, Math.min(AUTOSEEK_AT_MIN, seek));
    this.seekWindowMs = Math.floor(seek + 0.5);

    this.seekWindowLength = Math.floor(this.sampleRate * this.sequenceMs / 1000);
    this.seekLength = Math.floor(this.sampleRate * this.seekWindowMs / 1000);
  }
  seekBestOverlapPosition() {
    let bestOffset = 0;
    let bestCorrelation = Number.MIN_VALUE;
    this.preCalculateCorrelationReferenceStereo();
    for (let i = 0; i < this.seekLength; i++) {
      const correlation = this.calculateCrossCorrelationStereo(2 * i, this.refMidBuffer);
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = i;
      }
    }
    return bestOffset;
  }
  preCalculateCorrelationReferenceStereo() {
    for (let i = 0; i < this.overlapLength; i++) {
      const temp = i * (this.overlapLength - i);
      this.refMidBuffer[i * 2] = this.midBuffer[i * 2] * temp;
      this.refMidBuffer[i * 2 + 1] = this.midBuffer[i * 2 + 1] * temp;
    }
  }
  calculateCrossCorrelationStereo(mixingPos, compare) {
    let corr = 0;
    const vector = this._inputBuffer.vector;
    const offset = this._inputBuffer.startIndex + mixingPos;
    for (let i = 0; i < 2 * this.overlapLength; i += 2) {
      corr += vector[offset + i] * compare[i] + vector[offset + i + 1] * compare[i + 1];
    }
    return corr;
  }
  overlapStereo(outputPos, inputPos) {
    const output = this._outputBuffer.vector;
    const input = this._inputBuffer.vector;
    const outOffset = this._outputBuffer.endIndex + outputPos * 2;
    const inOffset = this._inputBuffer.startIndex + inputPos * 2;
    const fScale = 1.0 / this.overlapLength;
    for (let i = 0; i < this.overlapLength; i++) {
      const f1 = (this.overlapLength - i) * fScale;
      const f2 = i * fScale;
      const i2 = i * 2;
      output[outOffset + i2] = input[inOffset + i2] * f2 + this.midBuffer[i2] * f1;
      output[outOffset + i2 + 1] = input[inOffset + i2 + 1] * f2 + this.midBuffer[i2 + 1] * f1;
    }
  }
  process() {
    if (!this.midBuffer) {
      if (this._inputBuffer.frameCount < this.overlapLength) return;
      this.midBuffer = new Float32Array(this.overlapLength * 2);
      this._inputBuffer.receiveSamples(this.midBuffer, this.overlapLength);
    }
    while (this._inputBuffer.frameCount >= this.sampleReq) {
      const offset = this.seekBestOverlapPosition();
      this._outputBuffer.ensureAdditionalCapacity(this.overlapLength);
      this.overlapStereo(0, offset);
      this._outputBuffer.put(this.overlapLength);

      const temp = this.seekWindowLength - 2 * this.overlapLength;
      if (temp > 0) {
        this._outputBuffer.ensureAdditionalCapacity(temp);
        this._outputBuffer.putSamples(this._inputBuffer.vector, this._inputBuffer.position + offset + this.overlapLength, temp);
      }

      const midOffset = this._inputBuffer.startIndex + 2 * (offset + this.seekWindowLength - this.overlapLength);
      this.midBuffer.set(this._inputBuffer.vector.subarray(midOffset, midOffset + 2 * this.overlapLength));
      this.skipFract += this.nominalSkip;
      const ovlSkip = Math.floor(this.skipFract);
      this.skipFract -= ovlSkip;
      this._inputBuffer.receive(ovlSkip);
    }
  }
}

class SoundTouch {
  constructor() {
    this.transposer = new RateTransposer(false);
    this.stretch = new Stretch(false);
    this._inputBuffer = new FifoSampleBuffer();
    this._intermediateBuffer = new FifoSampleBuffer();
    this._outputBuffer = new FifoSampleBuffer();
    this._rate = 0;
    this._tempo = 0;
    this.virtualPitch = 1.0;
    this.virtualRate = 1.0;
    this.virtualTempo = 1.0;
    this.calculateEffectiveRateAndTempo();
  }
  clear() {
    this.transposer.clear();
    this.stretch.clear();
    if (this._inputBuffer) this._inputBuffer.clear();
    if (this._intermediateBuffer) this._intermediateBuffer.clear();
    if (this._outputBuffer) this._outputBuffer.clear();
  }
  get inputBuffer() { return this._inputBuffer; }
  get outputBuffer() { return this._outputBuffer; }
  get rate() { return this._rate; }
  set rate(rate) {
    this.virtualRate = rate;
    this.calculateEffectiveRateAndTempo();
  }
  get tempo() { return this._tempo; }
  set tempo(tempo) {
    this.virtualTempo = tempo;
    this.calculateEffectiveRateAndTempo();
  }
  set pitch(pitch) {
    this.virtualPitch = pitch;
    this.calculateEffectiveRateAndTempo();
  }
  calculateEffectiveRateAndTempo() {
    this._tempo = this.virtualTempo / this.virtualPitch;
    this._rate = this.virtualRate * this.virtualPitch;
    this.stretch.tempo = this._tempo;
    this.transposer.rate = this._rate;

    if (this._rate > 1.0) {
      if (this._outputBuffer !== this.transposer.outputBuffer) {
        this.stretch.inputBuffer = this._inputBuffer;
        this.stretch.outputBuffer = this._intermediateBuffer;
        this.transposer.inputBuffer = this._intermediateBuffer;
        this.transposer.outputBuffer = this._outputBuffer;
      }
    } else {
      if (this._outputBuffer !== this.stretch.outputBuffer) {
        this.transposer.inputBuffer = this._inputBuffer;
        this.transposer.outputBuffer = this._intermediateBuffer;
        this.stretch.inputBuffer = this._intermediateBuffer;
        this.stretch.outputBuffer = this._outputBuffer;
      }
    }
  }
  process() {
    if (this._rate > 1.0) {
      this.stretch.process();
      this.transposer.process();
    } else {
      this.transposer.process();
      this.stretch.process();
    }
  }
}

class WorkletBufferSource {
  constructor(channels, sampleRate) {
    this.leftChannel = channels[0];
    this.rightChannel = channels[1] || channels[0];
    this.sampleRate = sampleRate;
    this.length = this.leftChannel.length;
    this.position = 0;
  }
  extract(target, numFrames = 0, position = 0) {
    this.position = position;
    const len = this.length;
    let i = 0;
    for (; i < numFrames && (position + i) < len; i++) {
      target[i * 2] = this.leftChannel[position + i];
      target[i * 2 + 1] = this.rightChannel[position + i];
    }
    return i;
  }
}

class SoundTouchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.soundtouch = new SoundTouch();
    this.source = null;
    this.filter = null;
    this.isPlaying = false;
    this.keylock = false;
    this.rate = 1.0;
    this.sampleRate = 44100;

    this.loopEnabled = false;
    this.loopStartSample = 0;
    this.loopEndSample = 0;

    this.samples = new Float32Array(256);
    this.updateCounter = 0;

    // Real-Time Vinyl Scratch Engine State
    this.isScratching = false;
    this.scratchPosition = 0;
    this.scratchVelocity = 0;
    this.targetScratchVelocity = 0;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'load':
        this.sampleRate = msg.sampleRate || 44100;
        this.source = new WorkletBufferSource(msg.channels, this.sampleRate);
        this.filter = new SimpleFilter(this.source, this.soundtouch);
        this.updateRateAndKeylock();
        this.port.postMessage({ type: 'loaded', duration: this.source.length / this.sampleRate });
        break;

      case 'play':
        this.isPlaying = true;
        break;

      case 'pause':
        this.isPlaying = false;
        break;

      case 'scratchStart':
        this.isScratching = true;
        this.isPlaying = false;
        this.scratchPosition = this.filter ? this.filter.position : 0;
        this.scratchVelocity = 0;
        this.targetScratchVelocity = 0;
        break;

      case 'scratchMove':
        this.targetScratchVelocity = Math.max(-5.0, Math.min(5.0, msg.velocity || 0));
        break;

      case 'scratchEnd':
        this.isScratching = false;
        this.scratchVelocity = 0;
        this.targetScratchVelocity = 0;
        if (this.source) {
          const finalPos = Math.max(0, Math.min(this.source.length - 1, Math.floor(this.scratchPosition)));
          if (this.filter) {
            this.filter.sourcePosition = finalPos;
          }
          this.port.postMessage({
            type: 'timeUpdate',
            currentTime: finalPos / this.sampleRate
          });
        }
        if (msg.resume) {
          this.isPlaying = true;
        }
        break;

      case 'seek':
        if (this.source) {
          const samplePos = Math.max(0, Math.min(this.source.length - 1, Math.floor(msg.time * this.sampleRate)));
          if (this.filter) this.filter.sourcePosition = samplePos;
          this.scratchPosition = samplePos;
        }
        break;

      case 'setRate':
        this.rate = msg.rate;
        this.keylock = msg.keylock;
        this.updateRateAndKeylock();
        break;

      case 'setLoop':
        this.loopEnabled = msg.enabled;
        this.loopStartSample = Math.floor(msg.start * this.sampleRate);
        this.loopEndSample = Math.floor(msg.end * this.sampleRate);
        break;
    }
  }

  updateRateAndKeylock() {
    if (this.keylock) {
      // Decoupled: tempo changes without shifting pitch
      this.soundtouch.tempo = this.rate;
      this.soundtouch.pitch = 1.0;
    } else {
      // Vinyl mode: tempo and pitch change together
      this.soundtouch.rate = this.rate;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || output[0];
    const numFrames = left.length;

    if (!this.source) {
      left.fill(0);
      if (output[1]) right.fill(0);
      return true;
    }

    // 1. Vinyl Scratch Mode: Real-time audible scratching forward/backward
    if (this.isScratching) {
      const leftCh = this.source.leftChannel;
      const rightCh = this.source.rightChannel;
      const totalLen = this.source.length;

      if (totalLen < 2) {
        left.fill(0);
        if (output[1]) right.fill(0);
        return true;
      }

      for (let i = 0; i < numFrames; i++) {
        // Smoothly glide towards target velocity for organic vinyl feel & anti-pop
        this.scratchVelocity += (this.targetScratchVelocity - this.scratchVelocity) * 0.04;
        // Felt slipmat friction: smooth deceleration into silence when stationary
        this.targetScratchVelocity *= 0.9995;

        if (Math.abs(this.scratchVelocity) > 0.01) {
          this.scratchPosition += this.scratchVelocity;
          if (this.scratchPosition < 0) this.scratchPosition = 0;
          if (this.scratchPosition > totalLen - 2) this.scratchPosition = totalLen - 2;

          const idx = Math.floor(this.scratchPosition);
          const frac = this.scratchPosition - idx;

          left[i] = leftCh[idx] * (1 - frac) + leftCh[idx + 1] * frac;
          if (output[1]) {
            right[i] = rightCh[idx] * (1 - frac) + rightCh[idx + 1] * frac;
          }
        } else {
          left[i] = 0;
          if (output[1]) right[i] = 0;
        }
      }

      // Needle position update back to main thread (~40ms interval)
      this.updateCounter += numFrames;
      if (this.updateCounter >= 1764) {
        this.updateCounter = 0;
        this.port.postMessage({
          type: 'timeUpdate',
          currentTime: this.scratchPosition / this.sampleRate
        });
      }

      return true;
    }

    // 2. Regular Playback Mode: Time-stretched playback via SoundTouch
    if (!this.isPlaying || !this.filter) {
      left.fill(0);
      if (output[1]) right.fill(0);
      return true;
    }

    try {
      // Sample-accurate loop boundary check
      if (this.loopEnabled && this.loopEndSample > this.loopStartSample) {
        if (this.filter.position >= this.loopEndSample) {
          this.filter.sourcePosition = this.loopStartSample;
        }
      }

      if (this.samples.length < numFrames * 2) {
        this.samples = new Float32Array(numFrames * 2);
      }

      const extracted = this.filter.extract(this.samples, numFrames);

      for (let i = 0; i < extracted; i++) {
        left[i] = this.samples[i * 2];
        right[i] = this.samples[i * 2 + 1];
      }
      for (let i = extracted; i < numFrames; i++) {
        left[i] = 0;
        right[i] = 0;
      }

      if (extracted === 0 && this.filter.position >= this.source.length && !this.loopEnabled) {
        this.isPlaying = false;
        this.port.postMessage({ type: 'ended' });
      }

      // Periodic time updates back to main thread (~40ms interval)
      this.updateCounter += numFrames;
      if (this.updateCounter >= 1764) {
        this.updateCounter = 0;
        this.port.postMessage({
          type: 'timeUpdate',
          currentTime: (this.filter.position || 0) / this.sampleRate
        });
      }
    } catch (err) {
      left.fill(0);
      if (output[1]) right.fill(0);
    }

    return true;
  }
}

registerProcessor('soundtouch-processor', SoundTouchProcessor);
`;

let isWorkletRegistered = false;

export async function registerSoundTouchWorklet(context: AudioContext): Promise<boolean> {
  if (isWorkletRegistered) return true;
  try {
    const blob = new Blob([SOUNDTOUCH_WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    isWorkletRegistered = true;
    return true;
  } catch (err) {
    console.error('Failed to register SoundTouch worklet:', err);
    return false;
  }
}
