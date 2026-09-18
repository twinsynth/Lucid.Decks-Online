import React from 'react';
import { 
  HelpCircle, Sliders, Usb, Headphones, Disc, CheckCircle2, 
  ExternalLink, Sparkles, FolderOpen, ArrowRight, ShieldCheck, X 
} from 'lucide-react';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onEnableMidi?: () => void;
}

export function SetupGuideModal({ isOpen, onClose, onOpenSettings, onEnableMidi }: SetupGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 md:p-6 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#14141a] border border-white/15 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col relative">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00f2ff]/10 border border-[#00f2ff]/30 flex items-center justify-center text-[#00f2ff]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-widest text-white uppercase flex items-center gap-2">
                <span>DJ Hardware & Quickstart Guide</span>
                <span className="text-[10px] bg-[#00f2ff]/20 text-[#00f2ff] px-2 py-0.5 rounded-full font-mono font-bold">PRO</span>
              </h2>
              <p className="text-xs text-white/50 font-mono">Connect your controller, configure audio, and start mixing in 60 seconds</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors text-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col gap-6 no-scrollbar">
          
          {/* Step 1: Connecting Hardware */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-[#00f2ff] font-bold text-sm tracking-wider uppercase font-mono">
              <span className="w-6 h-6 rounded-full bg-[#00f2ff]/20 text-[#00f2ff] flex items-center justify-center text-xs">1</span>
              <Usb className="w-4 h-4" />
              <span>Connect Your DJ Controller</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Plug your DJ controller into your computer via <strong>USB</strong> (USB-A or USB-C).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-white/80">
              <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                <span className="text-emerald-400 font-bold block mb-1">✓ Plug & Play (Class-Compliant):</span>
                Most modern controllers (Pioneer DDJ-FLX4, Traktor Kontrol S2, Numark Mixtrack, Hercules, Denon) require <strong>zero drivers</strong> on macOS and Windows 10/11.
              </div>
              <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                <span className="text-amber-400 font-bold block mb-1">⚠ Windows ASIO Drivers:</span>
                For older Pioneer (DDJ-SB/SR) or Native Instruments hardware, download the free official USB driver from the manufacturer's support site.
              </div>
            </div>
          </div>

          {/* Step 2: Web MIDI Browser Permissions */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-[#10b981] font-bold text-sm tracking-wider uppercase font-mono">
              <span className="w-6 h-6 rounded-full bg-[#10b981]/20 text-[#10b981] flex items-center justify-center text-xs">2</span>
              <ShieldCheck className="w-4 h-4" />
              <span>Allow Browser MIDI Access</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Lucid Decks uses the official <strong>Web MIDI API</strong>. When prompted by your browser:
            </p>
            <div className="bg-black/40 border border-emerald-500/30 p-3 rounded-lg flex items-center justify-between gap-4">
              <div className="text-xs font-mono text-white/90">
                Click <span className="text-emerald-400 font-bold">"Allow"</span> when the browser requests permission: <br/>
                <span className="text-[11px] text-white/50 italic">"Lucid Decks wants to access your MIDI devices"</span>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-mono font-bold shrink-0">
                Chrome / Edge / Brave
              </span>
            </div>
          </div>

          {/* Step 3: MIDI Learn Any Controller */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-[#f59e0b] font-bold text-sm tracking-wider uppercase font-mono">
              <span className="w-6 h-6 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] flex items-center justify-center text-xs">3</span>
              <Sliders className="w-4 h-4" />
              <span>Map Any Knob, Fader, or Button (MIDI Learn)</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Native Instruments <strong>Traktor Kontrol S2</strong> is mapped out-of-the-box. To map <em>any other DJ controller</em>:
            </p>
            <ol className="list-decimal list-inside text-xs font-mono text-white/80 space-y-1.5 bg-black/40 p-3 rounded-lg border border-white/5">
              <li>Click <strong className="text-emerald-400">"MAP MIDI"</strong> in the top header.</li>
              <li>Click the on-screen knob, fader, play button, or hot cue you want to bind.</li>
              <li>Turn or press the matching physical control on your controller — it snaps instantly!</li>
              <li>Save or export your custom mappings in <strong className="text-white">Settings</strong>.</li>
            </ol>
          </div>

          {/* Step 4: Headphone Cueing & Audio Outputs */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-[#ff0055] font-bold text-sm tracking-wider uppercase font-mono">
              <span className="w-6 h-6 rounded-full bg-[#ff0055]/20 text-[#ff0055] flex items-center justify-center text-xs">4</span>
              <Headphones className="w-4 h-4" />
              <span>Headphone Cueing (Pre-Fade Listen)</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Preview tracks in your headphones before bringing them into the master mix:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="bg-black/40 border border-white/10 p-2.5 rounded-lg flex flex-col gap-1">
                <span className="text-white font-bold">Standard Stereo:</span>
                <span className="text-white/50 text-[11px]">Normal desktop/laptop speakers (headphone preview mixes into master).</span>
              </div>
              <div className="bg-black/40 border border-white/10 p-2.5 rounded-lg flex flex-col gap-1">
                <span className="text-amber-400 font-bold">Split Cable (L/R):</span>
                <span className="text-white/50 text-[11px]">Left channel to main speakers, Right channel to DJ headphones.</span>
              </div>
              <div className="bg-black/40 border border-white/10 p-2.5 rounded-lg flex flex-col gap-1">
                <span className="text-[#00f2ff] font-bold">4-CH Soundcard:</span>
                <span className="text-white/50 text-[11px]">Ch 1/2 to Master PA, Ch 3/4 to Controller headphone jack.</span>
              </div>
            </div>
          </div>

          {/* Step 5: Loading Music Offline */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-purple-400 font-bold text-sm tracking-wider uppercase font-mono">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs">5</span>
              <FolderOpen className="w-4 h-4" />
              <span>Drag & Drop Your Audio Tracks</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Open the <strong>Library</strong> (press <kbd className="px-1.5 py-0.5 bg-black rounded border border-white/20 text-[10px] font-mono">Space</kbd>) at the bottom of the screen. Drag and drop audio files (MP3, WAV, FLAC, AAC, OGG) or entire music folders directly into <strong>My Crate</strong>. Your library is indexed and stored locally in your browser so it stays ready offline!
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-black/60 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono text-white/40">
            Tip: Press <kbd className="px-1 bg-white/10 rounded text-white/70 font-mono">E</kbd> to open Edit Setup Mode
          </span>
          <button 
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#00f2ff] hover:bg-white text-black font-bold font-mono text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(0,242,255,0.3)]"
          >
            Got It, Let's Mix!
          </button>
        </div>

      </div>
    </div>
  );
}
