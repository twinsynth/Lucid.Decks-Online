import React, { useRef, useEffect, useState, useCallback } from 'react';

interface ZoomedWaveformProps {
  currentTime: number;
  duration: number;
  detailedPeaks: Float32Array;
  color: string;
  bpm: number;
  firstBeatOffset: number;
  hotCues?: (number | null)[];
  cuePoint?: number;
  onSeek: (time: number) => void;
  onHotCueClick?: (idx: number) => void;
  height?: number;
  className?: string;
}

const HOT_CUE_COLORS = ['#00f2ff', '#10b981', '#f59e0b', '#ff0055'];
const WINDOW_SECONDS = 6.0; // Show ~6 seconds around playhead (3 bars at 120 BPM)

export const ZoomedWaveform: React.FC<ZoomedWaveformProps> = ({
  currentTime,
  duration,
  detailedPeaks,
  color,
  bpm,
  firstBeatOffset,
  hotCues = [],
  cuePoint = 0,
  onSeek,
  onHotCueClick,
  height = 36,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);
  const [isHovered, setIsHovered] = useState(false);

  // Render waveform onto HTML5 canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const h = canvas.height;
    const centerY = h / 2;
    const centerX = width / 2;
    const pixelsPerSecond = width / WINDOW_SECONDS;

    // Clear background
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, width, h);

    // Center baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    const startTime = currentTime - WINDOW_SECONDS / 2;
    const endTime = currentTime + WINDOW_SECONDS / 2;

    // 1. Draw Beatgrid Lines (if BPM is valid)
    if (bpm > 40 && bpm < 250) {
      const beatPeriod = 60 / bpm;
      const kMin = Math.floor((startTime - firstBeatOffset) / beatPeriod);
      const kMax = Math.ceil((endTime - firstBeatOffset) / beatPeriod);

      for (let k = kMin; k <= kMax; k++) {
        const beatTime = firstBeatOffset + k * beatPeriod;
        const x = centerX + (beatTime - currentTime) * pixelsPerSecond;

        if (x >= -2 && x <= width + 2) {
          const isBar = ((k % 4) + 4) % 4 === 0;

          ctx.beginPath();
          if (isBar) {
            // Full-height Downbeat / Bar Line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();

            // Downbeat top/bottom accent pip
            ctx.fillStyle = color;
            ctx.fillRect(x - 1.5, 0, 3, 3);
            ctx.fillRect(x - 1.5, h - 3, 3, 3);
          } else {
            // Regular beat tick
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.moveTo(x, 4);
            ctx.lineTo(x, h - 4);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }

    // 2. Draw Zoomed Audio Waveform Peaks
    const hasPeaks = detailedPeaks && detailedPeaks.length > 0;
    if (hasPeaks) {
      const colWidth = 2;
      const numCols = Math.ceil(width / colWidth);

      for (let col = 0; col < numCols; col++) {
        const x = col * colWidth;
        const t = startTime + (x / width) * WINDOW_SECONDS;

        if (t >= 0 && t <= duration) {
          // Look up peak at 100 samples/sec
          const peakIdx = Math.floor(t * 100);
          const amp = detailedPeaks[peakIdx] || 0;
          const peakH = Math.max(1, amp * (centerY - 3));

          const isPast = x <= centerX;

          ctx.fillStyle = isPast
            ? color // Theme color for past audio
            : 'rgba(255, 255, 255, 0.55)'; // Bright silver/white for incoming audio

          // Mirrored bar
          ctx.fillRect(x, centerY - peakH, colWidth - 0.5, peakH * 2);
        }
      }
    }

    // 3. Draw Cue Point Marker ('C')
    if (cuePoint !== undefined && cuePoint >= startTime && cuePoint <= endTime) {
      const cueX = centerX + (cuePoint - currentTime) * pixelsPerSecond;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cueX, 0);
      ctx.lineTo(cueX, h);
      ctx.stroke();

      // Top badge
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cueX - 5, 0, 10, 9);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('C', cueX, 7);
    }

    // 4. Draw Hot Cue Markers (1 - 4)
    hotCues.forEach((hc, idx) => {
      if (hc !== null && hc !== undefined && hc >= startTime && hc <= endTime) {
        const hcX = centerX + (hc - currentTime) * pixelsPerSecond;
        const padColor = HOT_CUE_COLORS[idx] || color;

        ctx.strokeStyle = padColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hcX, 0);
        ctx.lineTo(hcX, h);
        ctx.stroke();

        // Hot cue top pill
        ctx.fillStyle = padColor;
        ctx.fillRect(hcX - 5, 0, 10, 9);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(idx + 1), hcX, 7);
      }
    });

    // 5. Stationary Center Playhead (Pioneer CDJ Red/Theme Needle)
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Top needle triangle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(centerX - 4, 0);
    ctx.lineTo(centerX + 4, 0);
    ctx.lineTo(centerX, 6);
    ctx.closePath();
    ctx.fill();

    // Bottom needle triangle
    ctx.beginPath();
    ctx.moveTo(centerX - 4, h);
    ctx.lineTo(centerX + 4, h);
    ctx.lineTo(centerX, h - 6);
    ctx.closePath();
    ctx.fill();
  }, [currentTime, duration, detailedPeaks, color, bpm, firstBeatOffset, hotCues, cuePoint]);

  // Sync canvas size with CSS dimensions and devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    render();
  }, [render]);

  useEffect(() => {
    render();
  }, [render, currentTime]);

  // Pointer scrubbing handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartTime.current = currentTime;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const clickedTime = currentTime + ((clickX - width / 2) / (width / 2)) * (WINDOW_SECONDS / 2);
    const clampedTime = Math.max(0, Math.min(duration, clickedTime));
    onSeek(clampedTime);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const dx = e.clientX - dragStartX.current;
    const pixelsPerSecond = width / WINDOW_SECONDS;
    const timeShift = -dx / pixelsPerSecond; // Drag left scrubs forward

    const newTime = Math.max(0, Math.min(duration, dragStartTime.current + timeShift));
    onSeek(newTime);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-lg overflow-hidden border border-white/10 select-none cursor-ew-resize bg-black/80 shadow-inner group ${className}`}
      style={{ height: `${height}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Zoomed Beat Waveform: Click or drag horizontally to scrub track"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
      />

      {/* Subtle Scrubbing Guide Overlay on Hover */}
      {isHovered && (
        <div className="absolute top-0.5 right-1.5 pointer-events-none text-[8px] font-mono font-bold tracking-widest text-white/40 uppercase bg-black/50 px-1 py-0.2 rounded border border-white/10">
          SCRUB
        </div>
      )}
    </div>
  );
};
