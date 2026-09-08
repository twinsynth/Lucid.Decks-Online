import React, { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../lib/AudioEngine';

export type BgVisualizerMode = 'aura' | 'horizon' | 'rings' | 'off';

interface BackgroundVisualizerProps {
  mode: BgVisualizerMode;
  deckAColor: string;
  deckBColor: string;
  deckAPlay: boolean;
  deckBPlay: boolean;
}

export function BackgroundVisualizer({
  mode,
  deckAColor,
  deckBColor,
  deckAPlay,
  deckBPlay
}: BackgroundVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pulseA, setPulseA] = useState(0);
  const [pulseB, setPulseB] = useState(0);

  useEffect(() => {
    if (mode === 'off') return;

    let animId: number;
    const canvas = canvasRef.current;
    const ctx = mode === 'horizon' && canvas ? canvas.getContext('2d') : null;

    // Fast temporary array for frequency analysis
    const dataA = new Uint8Array(32);
    const dataB = new Uint8Array(32);

    let smoothPulseA = 0;
    let smoothPulseB = 0;

    const render = () => {
      const engine = getAudioEngine();

      // Read sub-bass energy (bins 0..4) for Deck A and Deck B
      if (deckAPlay) {
        engine.deckA.analyzer.getByteFrequencyData(dataA);
        let bassA = 0;
        for (let i = 0; i < 4; i++) bassA += dataA[i];
        const rawA = bassA / (4 * 255);
        smoothPulseA = rawA >= smoothPulseA ? rawA : smoothPulseA * 0.91;
      } else {
        smoothPulseA *= 0.88;
      }

      if (deckBPlay) {
        engine.deckB.analyzer.getByteFrequencyData(dataB);
        let bassB = 0;
        for (let i = 0; i < 4; i++) bassB += dataB[i];
        const rawB = bassB / (4 * 255);
        smoothPulseB = rawB >= smoothPulseB ? rawB : smoothPulseB * 0.91;
      } else {
        smoothPulseB *= 0.88;
      }

      setPulseA(smoothPulseA);
      setPulseB(smoothPulseB);

      // Mode: Horizon (Flowing cyberpunk audio wave ribbon across background)
      if (mode === 'horizon' && ctx && canvas) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const centerY = h * 0.52;
        const totalPoints = 48;
        const sliceWidth = w / (totalPoints - 1);

        ctx.beginPath();
        for (let i = 0; i < totalPoints; i++) {
          const x = i * sliceWidth;
          // Deck A influences left half, Deck B influences right half
          const isLeft = i < totalPoints / 2;
          const energy = isLeft ? smoothPulseA : smoothPulseB;
          const wave = Math.sin(i * 0.4 + performance.now() * 0.003) * 20 * energy;
          const y = centerY + wave;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Neon glowing horizon stroke
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0.1, `${deckAColor}40`);
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        grad.addColorStop(0.9, `${deckBColor}40`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [mode, deckAPlay, deckBPlay, deckAColor, deckBColor]);

  if (mode === 'off') return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none -z-10">
      {/* 1. Mode: Reactive Neon Ambient Aura (Cinematic & Ultra-Lightweight) */}
      {mode === 'aura' && (
        <>
          {/* Deck A Ambient Halo */}
          <div 
            className="absolute top-1/2 left-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px] transition-transform duration-75 will-change-transform"
            style={{
              width: `${340 + pulseA * 160}px`,
              height: `${340 + pulseA * 160}px`,
              backgroundColor: deckAColor,
              opacity: deckAPlay ? 0.08 + pulseA * 0.18 : 0.03,
              transform: `translate(-50%, -50%) scale(${1 + pulseA * 0.15})`
            }}
          />

          {/* Deck B Ambient Halo */}
          <div 
            className="absolute top-1/2 right-[22%] translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px] transition-transform duration-75 will-change-transform"
            style={{
              width: `${340 + pulseB * 160}px`,
              height: `${340 + pulseB * 160}px`,
              backgroundColor: deckBColor,
              opacity: deckBPlay ? 0.08 + pulseB * 0.18 : 0.03,
              transform: `translate(50%, -50%) scale(${1 + pulseB * 0.15})`
            }}
          />

          {/* Central Mixer Breathing Glow */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 rounded-full blur-[130px] opacity-10 will-change-transform"
            style={{
              background: `radial-gradient(circle, #ffffff 0%, ${deckAColor} 40%, ${deckBColor} 80%, transparent 100%)`,
              transform: `translate(-50%, -50%) scale(${1 + (pulseA + pulseB) * 0.08})`
            }}
          />
        </>
      )}

      {/* 2. Mode: Cyberpunk Frequency Horizon */}
      {mode === 'horizon' && (
        <canvas
          ref={canvasRef}
          width={1200}
          height={600}
          className="w-full h-full object-cover opacity-60"
        />
      )}

      {/* 3. Mode: Acoustic Soundwave Rings */}
      {mode === 'rings' && (
        <>
          {/* Deck A Concentric Soundwave Rings */}
          <div className="absolute top-1/2 left-[24%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            {[1, 1.35, 1.7].map((factor, idx) => (
              <div
                key={idx}
                className="absolute rounded-full border border-dashed transition-all duration-75"
                style={{
                  width: `${260 * factor + pulseA * 40}px`,
                  height: `${260 * factor + pulseA * 40}px`,
                  borderColor: deckAColor,
                  opacity: deckAPlay ? (0.25 / factor) * (0.6 + pulseA * 0.8) : 0.04,
                  transform: `scale(${1 + pulseA * (0.05 * (idx + 1))})`
                }}
              />
            ))}
          </div>

          {/* Deck B Concentric Soundwave Rings */}
          <div className="absolute top-1/2 right-[24%] translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            {[1, 1.35, 1.7].map((factor, idx) => (
              <div
                key={idx}
                className="absolute rounded-full border border-dashed transition-all duration-75"
                style={{
                  width: `${260 * factor + pulseB * 40}px`,
                  height: `${260 * factor + pulseB * 40}px`,
                  borderColor: deckBColor,
                  opacity: deckBPlay ? (0.25 / factor) * (0.6 + pulseB * 0.8) : 0.04,
                  transform: `scale(${1 + pulseB * (0.05 * (idx + 1))})`
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
