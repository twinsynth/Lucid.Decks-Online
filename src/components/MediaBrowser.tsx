import React, { useRef, useState, useEffect } from 'react';
import { 
  FolderOpen, FileAudio, Trash2, Search, HardDrive, Sparkles, ChevronDown, 
  Cloud, Loader2, Play, Download, Music, Flame, ExternalLink, RefreshCw, AlertTriangle 
} from 'lucide-react';
import { 
  saveTrackToDB, 
  getAllTracksFromDB, 
  deleteTrackFromDB, 
  StoredTrack, 
  getStorageEstimate 
} from '../lib/LibraryDB';
import { generateDemoTrackA, generateDemoTrackB } from '../lib/DemoTracks';

export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('lucid_decks_backend_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  return '';
}

interface SoundCloudTrack {
  id: number;
  title: string;
  artist: string;
  avatarUrl?: string;
  artworkUrl?: string;
  duration: number;
  permalinkUrl: string;
  streamTranscodingUrl: string;
  protocol: string;
  trackAuth?: string;
  genre?: string;
  playbackCount?: number;
}

interface MediaBrowserProps {
  onLoadToDeck: (deck: 'A' | 'B', file: File, trackId?: string, hotCues?: (number | null)[]) => void;
  onClose?: () => void;
}

const SC_GENRES = [
  'Techno',
  'Tech House',
  'Drum & Bass',
  'House',
  'Afro House',
  'Dubstep',
  'Deep House',
  'Hip Hop Remix'
];

export function MediaBrowser({ onLoadToDeck, onClose }: MediaBrowserProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'crate' | 'soundcloud'>('crate');

  // Local Crate State
  const [tracks, setTracks] = useState<StoredTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usedMB: string; quotaMB: string }>({ usedMB: '0.0', quotaMB: 'N/A' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SoundCloud State
  const [scQuery, setScQuery] = useState('techno remix');
  const [scTracks, setScTracks] = useState<SoundCloudTrack[]>([]);
  const [isScSearching, setIsScSearching] = useState(false);
  const [scLoadingTrack, setScLoadingTrack] = useState<{ id: number; deck: 'A' | 'B' } | null>(null);
  const [scSavingTrackId, setScSavingTrackId] = useState<number | null>(null);
  const [scError, setScError] = useState<string | null>(null);
  const [hasSearchedSc, setHasSearchedSc] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);

  // Load tracks from IndexedDB on startup
  useEffect(() => {
    loadLibrary();
  }, []);

  // Pre-populate SoundCloud on first tab switch
  useEffect(() => {
    if (activeTab === 'soundcloud' && !hasSearchedSc && scTracks.length === 0) {
      handleSoundCloudSearch('techno remix');
    }
  }, [activeTab]);

  const loadLibrary = async () => {
    try {
      const stored = await getAllTracksFromDB();
      setTracks(stored);
      const est = await getStorageEstimate();
      setStorageInfo(est);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  };

  const handleLoadDemoCrate = async () => {
    setIsGeneratingDemo(true);
    try {
      const fileA = await generateDemoTrackA();
      const fileB = await generateDemoTrackB();
      
      const trackA = await saveTrackToDB(fileA, { bpm: 124, source: 'crate' });
      const trackB = await saveTrackToDB(fileB, { bpm: 126, source: 'crate' });

      await loadLibrary();

      // Automatically load to Deck A and Deck B
      onLoadToDeck('A', fileA, trackA.id);
      onLoadToDeck('B', fileB, trackB.id);
    } catch (err) {
      console.error('Failed to generate demo tracks:', err);
    } finally {
      setIsGeneratingDemo(false);
    }
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

  // Safe API Fetcher to prevent "Unexpected token '<', <!DOCTYPE... is not valid JSON" on static hosts
  const fetchSafeJson = async (path: string) => {
    const base = getBackendBaseUrl();
    const url = `${base}${path}`;
    const res = await fetch(url);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        const isStaticHost = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
        throw new Error(
          isStaticHost
            ? 'SoundCloud live searching requires the Lucid Decks Node backend server. GitHub Pages is a static host (no server). Run "npm run dev" locally or switch to "My Crate" for instant offline mixing.'
            : 'SoundCloud live searching requires the Lucid Decks Node backend server. If you are on GitHub Pages or a static host, please run "npm run dev" locally or switch to "My Crate" for local files.'
        );
      }
      const text = await res.text();
      throw new Error(`Server returned error (${res.status}): ${text.slice(0, 100)}`);
    }
    return res.json();
  };

  // SoundCloud API Handlers
  const handleSoundCloudSearch = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : scQuery).trim();
    if (!q) return;
    setIsScSearching(true);
    setScError(null);
    setHasSearchedSc(true);

    try {
      if (q.startsWith('https://soundcloud.com/')) {
        // Direct track URL resolve
        const data = await fetchSafeJson(`/api/soundcloud/resolve?url=${encodeURIComponent(q)}`);
        if (data.success && data.track) {
          setScTracks([data.track]);
        } else {
          setScError(data.error || 'Failed to resolve SoundCloud link.');
        }
      } else {
        // Search query
        const data = await fetchSafeJson(`/api/soundcloud/search?q=${encodeURIComponent(q)}&limit=24`);
        if (data.success && Array.isArray(data.tracks)) {
          setScTracks(data.tracks);
        } else {
          setScError(data.error || 'Failed to search SoundCloud.');
        }
      }
    } catch (err: any) {
      setScError(err.message || 'SoundCloud network error');
    } finally {
      setIsScSearching(false);
    }
  };

  const handleLoadSoundCloudTrack = async (deck: 'A' | 'B', track: SoundCloudTrack) => {
    setScLoadingTrack({ id: track.id, deck });
    try {
      const base = getBackendBaseUrl();
      const streamUrl = `${base}/api/soundcloud/stream?transcodingUrl=${encodeURIComponent(track.streamTranscodingUrl)}&trackAuth=${encodeURIComponent(track.trackAuth || '')}`;
      const res = await fetch(streamUrl);
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('text/html')) {
        throw new Error(
          'Live streaming requires the backend server. Start the local server with "npm run dev" to stream.'
        );
      }
      const blob = await res.blob();
      const safeName = `${track.artist} - ${track.title}`.replace(/[\/\\?%*:|"<>]/g, '_');
      const file = new File([blob], `${safeName}.mp3`, { type: 'audio/mpeg' });
      
      onLoadToDeck(deck, file, `sc_${track.id}`);
    } catch (err: any) {
      alert(`Could not load track from SoundCloud: ${err.message}`);
    } finally {
      setScLoadingTrack(null);
    }
  };

  const handleSaveSoundCloudToCrate = async (track: SoundCloudTrack) => {
    setScSavingTrackId(track.id);
    try {
      const base = getBackendBaseUrl();
      const streamUrl = `${base}/api/soundcloud/stream?transcodingUrl=${encodeURIComponent(track.streamTranscodingUrl)}&trackAuth=${encodeURIComponent(track.trackAuth || '')}`;
      const res = await fetch(streamUrl);
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('text/html')) {
        throw new Error(
          'Track caching requires the backend server. Start the local server with "npm run dev" to cache tracks.'
        );
      }
      const blob = await res.blob();
      const safeName = `${track.artist} - ${track.title}`.replace(/[\/\\?%*:|"<>]/g, '_');
      const file = new File([blob], `${safeName}.mp3`, { type: 'audio/mpeg' });
      await saveTrackToDB(file, {
        name: `${safeName}.mp3`,
        artist: track.artist,
        artworkUrl: track.artworkUrl,
        duration: track.duration,
        source: 'stream'
      });
      await loadLibrary();
    } catch (err: any) {
      alert(`Failed to save track to crate: ${err.message}`);
    } finally {
      setScSavingTrackId(null);
    }
  };

  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
      <div className="flex flex-wrap items-center justify-between p-2 px-4 border-b border-white/5 bg-black/40 gap-3">
        {/* Tab Switcher & Library Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 font-mono text-[10px]">
            <button 
              onClick={() => setActiveTab('crate')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all ${activeTab === 'crate' ? 'bg-[#00f2ff] text-black font-bold shadow-[0_0_12px_rgba(0,242,255,0.4)]' : 'text-white/60 hover:text-white'}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              MY CRATE {tracks.length > 0 && `(${tracks.length})`}
            </button>
            <button 
              onClick={() => setActiveTab('soundcloud')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all ${activeTab === 'soundcloud' ? 'bg-[#ff5500] text-white font-bold shadow-[0_0_12px_rgba(255,85,0,0.5)]' : 'text-white/60 hover:text-white'}`}
            >
              <Cloud className="w-3.5 h-3.5" />
              SOUNDCLOUD
            </button>
          </div>

          {activeTab === 'crate' && (
            <div className="hidden sm:flex items-center gap-1.5 text-[9px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5">
              <HardDrive className="w-3 h-3 text-emerald-400" />
              <span>{storageInfo.usedMB} MB / IndexedDB</span>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-sm relative">
          <Search className="w-3 h-3 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
          {activeTab === 'crate' ? (
            <input 
              type="text"
              placeholder="Search local crate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-full pl-8 pr-3 py-1 text-[11px] font-mono text-white placeholder-white/30 focus:outline-none focus:border-[#00f2ff]/50"
            />
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleSoundCloudSearch(); }} className="flex items-center gap-1">
              <input 
                type="text"
                placeholder="Search SoundCloud or paste URL..."
                value={scQuery}
                onChange={(e) => setScQuery(e.target.value)}
                className="w-full bg-black/40 border border-[#ff5500]/30 focus:border-[#ff5500] rounded-full pl-8 pr-8 py-1 text-[11px] font-mono text-white placeholder-white/30 focus:outline-none"
              />
              <button 
                type="submit" 
                disabled={isScSearching}
                className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-[#ff5500] text-white text-[9px] font-mono font-bold hover:brightness-110 disabled:opacity-50"
              >
                {isScSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'GO'}
              </button>
            </form>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {activeTab === 'crate' ? (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-[10px] uppercase font-mono px-3 py-1 bg-[#00f2ff]/10 hover:bg-[#00f2ff]/20 text-[#00f2ff] rounded border border-[#00f2ff]/30 transition-colors"
            >
              <FileAudio className="w-3 h-3" />
              + Add Tracks
            </button>
          ) : (
            <button 
              onClick={() => handleSoundCloudSearch()}
              disabled={isScSearching}
              className="flex items-center gap-1.5 text-[10px] uppercase font-mono px-3 py-1 bg-[#ff5500]/15 hover:bg-[#ff5500]/25 text-[#ff5500] rounded border border-[#ff5500]/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isScSearching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}

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

      {/* SoundCloud Quick Genre Chips Strip */}
      {activeTab === 'soundcloud' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-black/60 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[9px] font-mono text-[#ff5500] uppercase font-bold tracking-wider flex items-center gap-1 mr-1 shrink-0">
            <Flame className="w-3 h-3" /> TOP GENRES:
          </span>
          {SC_GENRES.map((genre) => (
            <button
              key={genre}
              onClick={() => {
                setScQuery(genre);
                handleSoundCloudSearch(genre);
              }}
              className="text-[9px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-[#ff5500]/20 hover:text-[#ff5500] border border-white/10 hover:border-[#ff5500]/40 text-white/70 transition-all shrink-0 active:scale-95"
            >
              #{genre}
            </button>
          ))}
        </div>
      )}

      {/* Main Drawer Content */}
      <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
        {activeTab === 'crate' ? (
          /* TAB 1: LOCAL CRATE (INDEXEDDB) */
          filteredTracks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2.5 p-4 text-center">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center gap-2 max-w-md">
                <FolderOpen className="w-8 h-8 text-[#00f2ff] opacity-80" />
                <span className="text-xs font-mono uppercase tracking-wider text-white/90 font-bold">
                  {tracks.length === 0 ? "Your Crate is Empty" : "No matching tracks"}
                </span>
                <p className="text-[11px] font-mono text-white/50 leading-normal">
                  Drop local audio files (MP3, WAV, FLAC, OGG, AAC) anywhere on screen, or load our instant offline demo tracks!
                </p>
                {tracks.length === 0 && (
                  <button 
                    onClick={handleLoadDemoCrate}
                    disabled={isGeneratingDemo}
                    className="mt-1 flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#00f2ff]/20 to-[#ff0055]/20 border border-[#00f2ff]/50 hover:border-[#00f2ff] text-white text-xs font-mono font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#00f2ff]" />
                    <span>{isGeneratingDemo ? 'Synthesizing Audio...' : 'Load Demo Tracks (124 & 126 BPM)'}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredTracks.map((track) => {
                const sizeMB = (track.size / (1024 * 1024)).toFixed(1);
                const sourceColor = track.source === 'ai' ? '#ff0055' : track.source === 'stream' ? '#ff5500' : '#00f2ff';
                const hasHotCues = track.hotCues && track.hotCues.some(c => c !== null);

                return (
                  <div 
                    key={track.id} 
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 p-2 rounded-lg flex items-center justify-between group transition-all"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                      {track.artworkUrl ? (
                        <img 
                          src={track.artworkUrl} 
                          alt="" 
                          className="w-8 h-8 rounded object-cover border border-white/10 shrink-0" 
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      ) : track.source === 'ai' ? (
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
                            {track.source === 'stream' ? 'SOUNDCLOUD' : track.source}
                          </span>
                          <span>•</span>
                          <span>{sizeMB} MB</span>
                          {track.duration && track.duration > 0 && (
                            <>
                              <span>•</span>
                              <span>{formatDuration(track.duration)}</span>
                            </>
                          )}
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
          )
        ) : (
          /* TAB 2: SOUNDCLOUD STREAMING CRATE */
          isScSearching ? (
            <div className="h-full flex flex-col items-center justify-center text-white/50 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#ff5500]" />
              <span className="text-xs uppercase font-mono tracking-widest text-[#ff5500]">
                Searching SoundCloud Tracks & Streams...
              </span>
            </div>
          ) : scError ? (
            <div className="h-full flex flex-col items-center justify-center text-red-400 gap-2.5 p-4 text-center max-w-xl mx-auto">
              <div className="p-2 rounded-full bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-xs font-mono text-white/90 leading-relaxed font-medium">{scError}</span>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <button 
                  onClick={handleLoadDemoCrate}
                  disabled={isGeneratingDemo}
                  className="text-[10px] uppercase font-mono px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-md border border-emerald-500/40 transition-all font-bold flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isGeneratingDemo ? 'Synthesizing...' : 'Load Demo Crate (Offline)'}</span>
                </button>
                <button 
                  onClick={() => setActiveTab('crate')}
                  className="text-[10px] uppercase font-mono px-3 py-1.5 bg-[#00f2ff]/20 hover:bg-[#00f2ff]/30 text-[#00f2ff] rounded-md border border-[#00f2ff]/40 transition-colors font-bold"
                >
                  Switch to My Crate (Local Files)
                </button>
                <button 
                  onClick={() => handleSoundCloudSearch()}
                  className="text-[10px] uppercase font-mono px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md border border-white/20 text-white transition-colors"
                >
                  Retry Search
                </button>
              </div>
            </div>
          ) : scTracks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40 gap-2">
              <Cloud className="w-8 h-8 text-[#ff5500]" />
              <span className="text-xs uppercase font-mono tracking-widest text-center">
                Search above for any track, remix, or paste a SoundCloud URL
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {scTracks.map((track) => {
                const isLoadingA = scLoadingTrack?.id === track.id && scLoadingTrack.deck === 'A';
                const isLoadingB = scLoadingTrack?.id === track.id && scLoadingTrack.deck === 'B';
                const isSaving = scSavingTrackId === track.id;

                return (
                  <div 
                    key={track.id} 
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#ff5500]/30 p-2 rounded-lg flex items-center justify-between group transition-all"
                  >
                    {/* Artwork & Details */}
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                      <div className="w-9 h-9 rounded overflow-hidden bg-black/60 border border-white/10 shrink-0 relative">
                        {track.artworkUrl ? (
                          <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#ff5500]">
                            <Music className="w-4 h-4" />
                          </div>
                        )}
                        <span className="absolute bottom-0 right-0 bg-black/80 px-1 text-[8px] font-mono text-white/90">
                          {formatDuration(track.duration)}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-mono truncate text-white/90 group-hover:text-white font-medium" title={track.title}>
                          {track.title}
                        </span>
                        <div className="flex items-center gap-2 text-[9px] font-mono opacity-50 truncate">
                          <span className="text-[#ff5500] font-bold truncate">{track.artist}</span>
                          {track.genre && (
                            <>
                              <span>•</span>
                              <span className="truncate">{track.genre}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {/* Load Deck A */}
                      <button 
                        onClick={() => handleLoadSoundCloudTrack('A', track)}
                        disabled={isLoadingA || isLoadingB}
                        className={`w-7 h-7 flex items-center justify-center rounded text-[10px] font-bold border transition-all active:scale-95 ${
                          isLoadingA 
                            ? 'bg-[#00f2ff]/20 text-[#00f2ff] border-[#00f2ff] animate-pulse' 
                            : 'bg-black/60 text-[#00f2ff] hover:bg-[#00f2ff] hover:text-black border-[#00f2ff]/30'
                        }`}
                        title="Stream & Load to Deck A"
                      >
                        {isLoadingA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'A'}
                      </button>

                      {/* Load Deck B */}
                      <button 
                        onClick={() => handleLoadSoundCloudTrack('B', track)}
                        disabled={isLoadingA || isLoadingB}
                        className={`w-7 h-7 flex items-center justify-center rounded text-[10px] font-bold border transition-all active:scale-95 ${
                          isLoadingB 
                            ? 'bg-[#ff0055]/20 text-[#ff0055] border-[#ff0055] animate-pulse' 
                            : 'bg-black/60 text-[#ff0055] hover:bg-[#ff0055] hover:text-white border-[#ff0055]/30'
                        }`}
                        title="Stream & Load to Deck B"
                      >
                        {isLoadingB ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'B'}
                      </button>

                      {/* Save to Local Crate */}
                      <button 
                        onClick={() => handleSaveSoundCloudToCrate(track)}
                        disabled={isSaving}
                        className="w-7 h-7 flex items-center justify-center rounded text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        title="Save to My Crate (Offline Cache)"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
                      </button>

                      {/* External Link */}
                      {track.permalinkUrl && (
                        <a 
                          href={track.permalinkUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-6 h-6 hidden xl:flex items-center justify-center text-white/20 hover:text-[#ff5500] transition-colors"
                          title="Open on SoundCloud"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
