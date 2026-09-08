import React, { useState } from 'react';
import { Music, Play, Loader2, Download, Plus } from 'lucide-react';
import { saveTrackToDB } from '../lib/LibraryDB';

interface AILabProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (file: File) => void;
}

interface Track {
  id: string;
  prompt: string;
  blob: Blob;
  url: string;
}

export function AILab({ isOpen, onClose, onAddTrack }: AILabProps) {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<'clip' | 'pro'>('clip');
  const [isGenerating, setIsGenerating] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate music');
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      const trackId = `AI_${Date.now()}`;
      const trackName = `AI_${prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString().slice(-4)}.wav`;
      const file = new File([blob], trackName, { type: data.mimeType || 'audio/wav' });

      // Automatically persist to IndexedDB
      try {
        await saveTrackToDB(file, { id: trackId, name: trackName, source: 'ai' });
        onAddTrack(file);
      } catch (dbErr) {
        console.warn('Failed to auto-save AI track to IndexedDB:', dbErr);
      }

      setTracks(prev => [{
        id: trackId,
        prompt,
        blob,
        url
      }, ...prev]);
      
      setPrompt('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8 backdrop-blur-md">
      <div className="bg-[#1a1a20] border border-[#00f2ff]/30 rounded-2xl p-8 max-w-4xl w-full max-h-full overflow-hidden shadow-[0_0_50px_rgba(0,242,255,0.1)] flex flex-col relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white text-xl z-10">
          ✕
        </button>
        
        <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6 shrink-0">
          <div className="p-2 bg-[#00f2ff]/10 rounded-lg">
            <Music className="w-6 h-6 text-[#00f2ff]" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-widest text-[#00f2ff]">AI MUSIC LAB</h2>
            <p className="text-xs text-white/50 font-mono tracking-wider">POWERED BY GOOGLE LYRIA</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8 flex-1 overflow-hidden">
          {/* Left Column: Generation Controls */}
          <div className="flex-1 flex flex-col gap-6 shrink-0">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[#00f2ff]">PROMPT</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the track you want to generate (e.g., 'A 120 BPM deep house track with a pulsing bassline and atmospheric pads')"
                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm resize-none focus:outline-none focus:border-[#00f2ff]/50 transition-colors"
                disabled={isGenerating}
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[#00f2ff]">MODEL / DURATION</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDuration('clip')}
                  className={`flex-1 py-3 px-4 rounded-xl border text-xs font-mono tracking-wider transition-all ${
                    duration === 'clip' 
                      ? 'bg-[#00f2ff]/20 border-[#00f2ff] text-white shadow-[0_0_15px_rgba(0,242,255,0.2)]' 
                      : 'bg-black/20 border-white/10 text-white/50 hover:border-white/30'
                  }`}
                  disabled={isGenerating}
                >
                  CLIP (30s)
                </button>
                <button 
                  onClick={() => setDuration('pro')}
                  className={`flex-1 py-3 px-4 rounded-xl border text-xs font-mono tracking-wider transition-all ${
                    duration === 'pro' 
                      ? 'bg-[#ff0055]/20 border-[#ff0055] text-white shadow-[0_0_15px_rgba(255,0,85,0.2)]' 
                      : 'bg-black/20 border-white/10 text-white/50 hover:border-white/30'
                  }`}
                  disabled={isGenerating}
                >
                  FULL TRACK
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-xs font-mono">
                {error}
              </div>
            )}

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="mt-auto w-full py-4 rounded-xl font-bold tracking-widest uppercase transition-all bg-[#00f2ff] text-black hover:bg-white disabled:opacity-50 disabled:hover:bg-[#00f2ff] flex items-center justify-center gap-3"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  GENERATING...
                </>
              ) : (
                'GENERATE TRACK'
              )}
            </button>
          </div>

          {/* Right Column: Library */}
          <div className="flex-1 flex flex-col border border-white/10 rounded-xl bg-black/20 overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-black/40">
              <h3 className="text-xs font-bold tracking-widest text-white/50 uppercase">Generated Library</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {tracks.length === 0 ? (
                <div className="m-auto text-center text-white/30 text-xs font-mono">
                  No tracks generated yet.
                </div>
              ) : (
                tracks.map((track, i) => (
                  <div key={track.id} className="bg-black/40 border border-white/10 p-3 rounded-lg flex flex-col gap-3 group hover:border-[#00f2ff]/30 transition-colors">
                    <div className="text-xs text-white/70 italic line-clamp-2">
                      "{track.prompt}"
                    </div>
                    <audio controls src={track.url} className="w-full h-8 opacity-70 group-hover:opacity-100 transition-opacity" />
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const file = new File([track.blob], `AI_Track_${track.id}.wav`, { type: track.blob.type });
                          onAddTrack(file);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-1.5 bg-white/5 hover:bg-[#00f2ff]/20 hover:text-[#00f2ff] border border-white/10 hover:border-[#00f2ff]/50 rounded text-[10px] tracking-wider uppercase transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add to Library
                      </button>
                      <a 
                        href={track.url} 
                        download={`AI_Track_${track.id}.wav`}
                        className="flex-1 flex items-center justify-center gap-2 py-1.5 bg-white/5 hover:bg-white/20 border border-white/10 rounded text-[10px] tracking-wider uppercase transition-colors"
                      >
                        <Download className="w-3 h-3" /> Save
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
