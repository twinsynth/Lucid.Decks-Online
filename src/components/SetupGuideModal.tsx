import React from 'react';
import { 
  X, Usb, Cpu, Radio, Sliders, Headphones, FolderOpen, 
  ExternalLink, CheckCircle2, ChevronRight, HelpCircle
} from 'lucide-react';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function SetupGuideModal({ isOpen, onClose, onOpenSettings }: SetupGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="bg-[#121318] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#00f2ff]/10 border border-[#00f2ff]/30">
              <HelpCircle className="w-5 h-5 text-[#00f2ff]" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-widest text-white uppercase">
                DJ Hardware & Quickstart Setup Guide
              </h2>
              <p className="text-[11px] font-mono text-white/50">
                Connect your controller, configure audio routing, and start mixing in minutes
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm no-scrollbar">
          
          {/* Step 1: Plug in Controller */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
              <Usb className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">STEP 1</span>
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Connect Your DJ Controller</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Plug your DJ controller into your computer via USB before launching the web browser. If your deck uses an external power supply, make sure it is plugged in and switched on.
              </p>
            </div>
          </div>

          {/* Step 2: Download & Install Drivers */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">STEP 2</span>
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Install Device Drivers (ASIO on Windows)</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Most modern controllers are USB class-compliant on macOS, but Windows requires the manufacturer's low-latency audio/MIDI driver:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 font-mono text-[11px]">
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-emerald-400 font-bold block mb-0.5">Pioneer / AlphaTheta</span>
                  <span className="text-white/50 text-[10px]">Download Pioneer DDJ Driver for your model (e.g. DDJ-400, FLX4).</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-emerald-400 font-bold block mb-0.5">Native Instruments Traktor</span>
                  <span className="text-white/50 text-[10px]">Download Controller Driver via Native Access for Kontrol S2/S4.</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-emerald-400 font-bold block mb-0.5">Hercules / Numark / Denon</span>
                  <span className="text-white/50 text-[10px]">Install official ASIO driver package from manufacturer support site.</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-emerald-400 font-bold block mb-0.5">Generic / Universal ASIO</span>
                  <span className="text-white/50 text-[10px]">If no driver exists, <a href="https://asio4all.org" target="_blank" rel="noreferrer" className="text-[#00f2ff] underline">ASIO4ALL</a> provides low-latency universal audio.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Browser Permissions & Web MIDI */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
            <div className="w-9 h-9 rounded-lg bg-[#00f2ff]/10 border border-[#00f2ff]/30 flex items-center justify-center shrink-0 text-[#00f2ff]">
              <Radio className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-[#00f2ff] bg-[#00f2ff]/10 px-1.5 py-0.5 rounded border border-[#00f2ff]/20">STEP 3</span>
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Enable Web MIDI in Chrome / Edge / Opera</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Chromium browsers (Google Chrome, Microsoft Edge, Opera, Brave) natively support Web MIDI. Click the <span className="font-mono text-[#00f2ff] font-bold">MIDI</span> checkbox in the top header. When the browser displays the permission prompt (<span className="text-white font-medium">"Allow Lucid Decks to use your MIDI devices"</span>), click <span className="text-emerald-400 font-bold">Allow</span>.
              </p>
            </div>
          </div>

          {/* Step 4: Map MIDI Controls */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">STEP 4</span>
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Map Any Knob, Fader, or Button (MIDI Learn)</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Native Instruments Traktor Kontrol S2 is pre-mapped out of the box. For any other controller:
              </p>
              <ol className="list-decimal list-inside text-xs text-white/60 space-y-1 font-mono pt-1">
                <li>Click <span className="text-emerald-400 font-bold">MAP MIDI</span> in the header. Controls will pulse with green highlight rings.</li>
                <li>Click on the screen control you want to assign (e.g. crossfader, EQ knob, play button).</li>
                <li>Move the corresponding physical control on your DJ hardware. It will bind instantly!</li>
                <li>Click <span className="text-white font-bold">LEARNING...</span> to exit learn mode and save your mapping.</li>
              </ol>
            </div>
          </div>

          {/* Step 5: Headphone Cueing & Audio Routing */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shrink-0 text-purple-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">STEP 5</span>
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Headphone Cueing (PFL) & Audio Routing</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                To pre-listen to tracks in your headphones before bringing them into the master mix:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-purple-400 font-bold block mb-0.5">4-Channel DJ Soundcard</span>
                  <span className="text-white/50 text-[10px]">In Settings, select 4-Channel mode. Master plays to speakers (Ch 1-2) and headphones play Cue (Ch 3-4).</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-amber-400 font-bold block mb-0.5">DJ Split Cable (L / R)</span>
                  <span className="text-white/50 text-[10px]">Use a standard 3.5mm stereo DJ splitter: Left channel routes Master to speakers, Right routes Cue to headphones.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 6: Loading Music */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
            <div className="w-9 h-9 rounded-lg bg-[#ff0055]/10 border border-[#ff0055]/30 flex items-center justify-center shrink-0 text-[#ff0055]">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-[#ff0055] bg-[#ff0055]/10 px-1.5 py-0.5 rounded border border-[#ff0055]/20">STEP 6</span>
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Load Music (Offline My Crate)</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Press <span className="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded">Space</span> to open the Library. Drag and drop any MP3, WAV, FLAC, AAC, or OGG tracks directly into the drawer. Tracks are stored directly in browser IndexedDB with zero cloud lag, persistent hot cues, and instantaneous waveform rendering.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/50 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono text-white/40">
            Tip: Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded border border-white/20 text-white/80">?</kbd> anytime to open this guide.
          </span>
          <div className="flex items-center gap-3">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="text-xs font-mono uppercase px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/50 text-white/80 hover:text-white transition-colors"
              >
                Open Audio Settings
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xs font-mono uppercase px-4 py-1.5 rounded-lg bg-[#00f2ff]/20 hover:bg-[#00f2ff]/30 text-[#00f2ff] border border-[#00f2ff]/40 transition-colors font-bold"
            >
              Got It
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
