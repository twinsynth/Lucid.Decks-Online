import React, { useRef, useState, useEffect } from 'react';
import { FolderOpen, FileAudio, Trash2, Search, HardDrive, Sparkles, ChevronDown } from 'lucide-react';
import { 
  saveTrackToDB, 
  getAllTracksFromDB, 
  deleteTrackFromDB, 
  StoredTrack, 
  getStorageEstimate 
} from '../lib/LibraryDB';

interface MediaBrowserProps {
  onLoadToDeck: (deck: 'A' | 'B', file: File, trackId?: string, hotCues?: (number | null)[]) => void;
  onClose?: () => void;
}

export function MediaBrowser({ onLoadToDeck, onClose }: MediaBrowserProps) {
  const [tracks, setTracks] = useState<StoredTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usedMB: string; quotaMB: string }>({ usedMB: '0.0', quotaMB: 'N/A' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tracks from IndexedDB on startup
  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      const stored = await getAllTracksFromDB();
      setTracks(stored);
      const est = await getStorageEstimate();
      setStorageInfo(est);
    } catch (err) {
      console.error('Failed to load library from IndexedDB:', err);
    }
  };

  const addFilesToLibrary = async (filesToAdd: (File | Blob)[], source: 'local' | 'stream' | 'ai' = 'local') => {
    for (const f of filesToAdd) {
      const name = f instanceof File ? f.name : `Track_${Date.now()}.wav`;
      // Check if already in library by name and size
      const exists = tracks.some(t => t.name === name && t.size === f.size);
      if (!exists) {
        try {
          const saved = await saveTrackToDB(f, { name, source });
          setTracks(prev => [saved, ...prev]);
        } catch (err) {
          console.error('Failed to save track to IndexedDB:', err);
        }
      }
    }
    const est = await getStorageEstimate();
    setStorageInfo(est);
  };

  const handleDeleteTrack = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTrackFromDB(id);
      setTracks(prev => prev.filter(t => t.id !== id));
      const est = await getStorageEstimate();
      setStorageInfo(est);
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  };

  const handleLoadTrack = (deck: 'A' | 'B', track: StoredTrack) => {
    const file = track.blob instanceof File 
      ? track.blob 
      : new File([track.blob], track.name, { type: track.type || 'audio/mpeg' });
    onLoadToDeck(deck, file, track.id, track.hotCues);
  };

  // Event listener for AI Lab track additions
  useEffect(() => {
    const handleAddFile = async (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.file) {
        await addFilesToLibrary([customEvent.detail.file], 'ai');
      }
    };
    window.addEventListener('dj-add-file', handleAddFile);
    return () => window.removeEventListener('dj-add-file', handleAddFile);
  }, [tracks]);

  const handleFiles = async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const audioFiles = Array.from(newFiles).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aiff)$/i));
    await addFilesToLibrary(audioFiles, 'local');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const items = e.dataTransfer.items;
    if (items) {
      const audioFiles: File[] = [];
      const promises: Promise<void>[] = [];

      const traverseFileTree = (item: any) => {
        if (!item) return;
        if (item.isFile) {
          promises.push(new Promise((resolve) => {
            item.file((file: File) => {
              const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aiff)$/i);
              if (isAudio) audioFiles.push(file);
              resolve();
            });
          }));
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          const readEntries = () => {
            promises.push(new Promise((resolve) => {
              dirReader.readEntries((entries: any[]) => {
                if (entries.length === 0) {
                  resolve();
                } else {
                  entries.forEach(entry => traverseFileTree(entry));
                  readEntries();
                  resolve();
                }
              });
            }));
          };
          readEntries();
        }
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (item) traverseFileTree(item);
      }

      Promise.all(promises).then(() => {
        setTimeout(async () => {
          if (audioFiles.length > 0) {
            await addFilesToLibrary(audioFiles, 'local');
          }
        }, 100);
      });
    } else {
      handleFiles(e.dataTransfer.files);
    }
  };

  const filteredTracks = tracks.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      className={`h-full w-full border-t border-white/10 bg-black/50 shrink-0 flex flex-col transition-colors ${isDragOver ? 'bg-[#00f2ff]/10 border-[#00f2ff]/50' : ''}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
    >
      {/* Browser Header Strip */}
      <div className="flex items-center justify-between p-2 px-4 border-b border-white/5 bg-black/40 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] tracking-widest text-[#00f2ff] font-bold uppercase">
            <FolderOpen className="w-3.5 h-3.5" />
            LIBRARY {tracks.length > 0 && `(${tracks.length})`}
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5">
            <HardDrive className="w-3 h-3 text-emerald-400" />
            <span>{storageInfo.usedMB} MB / IndexedDB</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-xs relative">
          <Search className="w-3 h-3 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-full pl-8 pr-3 py-1 text-[11px] font-mono text-white placeholder-white/30 focus:outline-none focus:border-[#00f2ff]/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-[10px] uppercase font-mono px-3 py-1 bg-[#00f2ff]/10 hover:bg-[#00f2ff]/20 text-[#00f2ff] rounded border border-[#00f2ff]/30 transition-colors"
          >
            <FileAudio className="w-3 h-3" />
            + Add Tracks
          </button>
          {onClose && (
            <button 
              onClick={onClose}
              className="flex items-center gap-1 text-[10px] uppercase font-mono px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-white/60 hover:text-white transition-colors ml-1"
              title="Collapse Library Drawer (Space)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hide</span>
            </button>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          multiple 
          accept="audio/*"
          onChange={(e) => handleFiles(e.target.files)} 
        />
      </div>

      {/* Tracks Grid */}
      <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
        {filteredTracks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none gap-2">
            <FolderOpen className="w-8 h-8" />
            <span className="text-xs uppercase font-mono tracking-widest">
              {tracks.length === 0 ? "Drop audio files, folders or AI tracks here (Saved in IndexedDB)" : "No matching tracks"}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredTracks.map((track) => {
              const sizeMB = (track.size / (1024 * 1024)).toFixed(1);
              const sourceColor = track.source === 'ai' ? '#ff0055' : track.source === 'stream' ? '#00f2ff' : '#a1a1aa';
              const hasHotCues = track.hotCues && track.hotCues.some(c => c !== null);

              return (
                <div 
                  key={track.id} 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 p-2 rounded-lg flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                    {track.source === 'ai' ? (
                      <Sparkles className="w-4 h-4 text-[#ff0055] shrink-0" />
                    ) : (
                      <FileAudio className="w-4 h-4 opacity-50 shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-mono truncate text-white/90 group-hover:text-white" title={track.name}>
                        {track.name}
                      </span>
                      <div className="flex items-center gap-2 text-[9px] font-mono opacity-50">
                        <span style={{ color: sourceColor }} className="uppercase font-bold">
                          {track.source}
                        </span>
                        <span>•</span>
                        <span>{sizeMB} MB</span>
                        {track.bpm && track.bpm > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-bold">{track.bpm} BPM</span>
                          </>
                        )}
                        {hasHotCues && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 font-bold">CUES</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button 
                      onClick={() => handleLoadTrack('A', track)}
                      className="w-7 h-7 flex items-center justify-center bg-black/60 rounded text-[10px] font-bold text-[#00f2ff] hover:bg-[#00f2ff] hover:text-black border border-[#00f2ff]/30 transition-all active:scale-95"
                      title="Load to Deck A"
                    >
                      A
                    </button>
                    <button 
                      onClick={() => handleLoadTrack('B', track)}
                      className="w-7 h-7 flex items-center justify-center bg-black/60 rounded text-[10px] font-bold text-[#ff0055] hover:bg-[#ff0055] hover:text-white border border-[#ff0055]/30 transition-all active:scale-95"
                      title="Load to Deck B"
                    >
                      B
                    </button>
                    <button 
                      onClick={(e) => handleDeleteTrack(track.id, e)}
                      className="w-7 h-7 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove from Library"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
