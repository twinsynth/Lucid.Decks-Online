import React, { useRef, useState, useEffect } from 'react';
import { FolderOpen, FileAudio, Play, Cloud, Loader2 } from 'lucide-react';

interface MediaBrowserProps {
  onLoadToDeck: (deck: 'A' | 'B', file: File) => void;
}

export function MediaBrowser({ onLoadToDeck }: MediaBrowserProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  const downloadDriveFile = async (id: string, accessToken: string, name: string, mimeType: string): Promise<File | null> => {
      try {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          if (!response.ok) {
              console.error(`Failed to download ${name}`);
              return null;
          }
          const blob = await response.blob();
          return new File([blob], name, { type: mimeType });
      } catch (err) {
          console.error(`Error downloading ${name}`, err);
          return null;
      }
  }

  const handlePickedFiles = async (docs: any[], accessToken: string) => {
    setIsLoadingDrive(true);
    try {
        const driveFiles: File[] = [];
        for (const doc of docs) {
            if (doc.mimeType === 'application/vnd.google-apps.folder') {
                const folderId = doc.id;
                const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                const json = await res.json();
                if (json.files) {
                   for (const f of json.files) {
                       if (f.mimeType.startsWith('audio/') || f.mimeType === 'video/mp4' || f.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aiff)$/i)) {
                           const file = await downloadDriveFile(f.id, accessToken, f.name, f.mimeType);
                           if (file) driveFiles.push(file);
                       }
                   }
                }
            } else {
                const file = await downloadDriveFile(doc.id, accessToken, doc.name, doc.mimeType);
                if (file) driveFiles.push(file);
            }
        }
        
        if (driveFiles.length > 0) {
            setFiles(prev => {
              const existingNames = new Set(prev.map(f => f.name));
              const added = driveFiles.filter(f => !existingNames.has(f.name));
              return [...prev, ...added];
            });
        }
    } catch (err) {
        console.error("Error loading drive files:", err);
    } finally {
        setIsLoadingDrive(false);
    }
  }

  const handleDrivePicker = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      alert("Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID in your environment variables.");
      return;
    }

    const g: any = (window as any).google;
    const gapi: any = (window as any).gapi;

    if (!g || !g.accounts) {
       alert("Google Identity Services not loaded yet.");
       return;
    }

    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
      callback: (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          console.error(tokenResponse);
          return;
        }
        
        const showPicker = (accessToken: string) => {
          const pickerOrigin =
            window.location.ancestorOrigins &&
            window.location.ancestorOrigins.length > 0
              ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
              : window.location.origin;

          const view = new gapi.picker.DocsView(gapi.picker.ViewId.DOCS)
            .setMimeTypes('audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/x-m4a,audio/mp4,application/vnd.google-apps.folder,audio/aac')
            .setIncludeFolders(true);

          const picker = new gapi.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(accessToken)
            .setCallback((data: any) => {
              if (data.action == gapi.picker.Action.PICKED) {
                handlePickedFiles(data.docs, accessToken);
              }
            })
            .setOrigin(pickerOrigin)
            .enableFeature(gapi.picker.Feature.MULTISELECT_ENABLED)
            .build();
          picker.setVisible(true);
        }

        if (!gapi.picker) {
          gapi.load('picker', () => showPicker(tokenResponse.access_token));
        } else {
          showPicker(tokenResponse.access_token);
        }
      },
    });
    
    client.requestAccessToken();
  };

  useEffect(() => {
    const handleAddFile = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.file) {
        setFiles(prev => {
          const exists = prev.some(f => f.name === customEvent.detail.file.name);
          if (exists) return prev;
          return [customEvent.detail.file, ...prev];
        });
      }
    };
    window.addEventListener('dj-add-file', handleAddFile);
    return () => window.removeEventListener('dj-add-file', handleAddFile);
  }, []);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const audioFiles = Array.from(newFiles).filter(f => f.type.startsWith('audio/'));
    setFiles(prev => {
      // Avoid duplicates based on name
      const existingNames = new Set(prev.map(f => f.name));
      const added = audioFiles.filter(f => !existingNames.has(f.name));
      return [...prev, ...added];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    // For dropping folders, ideally we'd use File System Access API or webkitGetAsEntry
    // But as a fallback, we just take files. Dragging folders might not give all files easily without recursive read.
    // If we use DataTransferItem, we can traverse directories. 
    // Since this is a simple implementation, let's just grab the flat files or items.
    const items = e.dataTransfer.items;
    if (items) {
      let audioFiles: File[] = [];
      const promises: Promise<void>[] = [];

      const traverseFileTree = (item: any, path = '') => {
        if (!item) return;
        if (item.isFile) {
          promises.push(new Promise((resolve) => {
            item.file((file: File) => {
              const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aiff)$/i);
              if (isAudio) {
                // Keep path info if needed, but for now just push file
                audioFiles.push(file);
              }
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
                  entries.forEach(entry => traverseFileTree(entry, path + item.name + '/'));
                  readEntries(); // Continue reading if more entries
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
        // Wait a short tick for nested promises
        setTimeout(() => {
          if (audioFiles.length > 0) {
             setFiles(prev => {
              const existingNames = new Set(prev.map(f => f.name));
              const added = audioFiles.filter(f => !existingNames.has(f.name));
              return [...prev, ...added];
            });
          }
        }, 100);
      });
    } else {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div 
      className={`h-48 border-t border-white/10 bg-black/40 shrink-0 flex flex-col transition-colors ${isDragOver ? 'bg-[#00f2ff]/10 border-[#00f2ff]/50' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="flex items-center justify-between p-2 px-4 border-b border-white/5 bg-black/20">
        <div className="flex items-center gap-2 text-[10px] tracking-widest text-[#00f2ff] font-bold">
          <FolderOpen className="w-3 h-3" />
          LIBRARY {files.length > 0 && `(${files.length})`}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleDrivePicker}
            disabled={isLoadingDrive}
            className="flex items-center gap-2 text-[10px] uppercase font-mono px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors disabled:opacity-50"
          >
            {isLoadingDrive ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3 text-[#00f2ff]" />}
            Load from Drive
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] uppercase font-mono px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
          >
            Add Files / Folders
          </button>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          multiple 
          //@ts-ignore - React typings might not have webkitdirectory
          webkitdirectory="true"
          directory="true"
          onChange={(e) => handleFiles(e.target.files)} 
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
            <FolderOpen className="w-8 h-8 mb-2" />
            <span className="text-xs uppercase font-mono tracking-widest">Drop audio files or folders here</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {files.map((file, idx) => (
              <div key={idx} className="bg-white/5 hover:bg-white/10 border border-white/5 p-2 rounded flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <FileAudio className="w-4 h-4 opacity-50 shrink-0" />
                  <span className="text-xs font-mono truncate opacity-90">{file.name}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                  <button 
                    onClick={() => onLoadToDeck('A', file)}
                    className="w-6 h-6 flex items-center justify-center bg-black/40 rounded text-[9px] font-bold hover:text-[#00f2ff] hover:border-[#00f2ff] border border-transparent transition-all"
                  >
                    A
                  </button>
                  <button 
                    onClick={() => onLoadToDeck('B', file)}
                    className="w-6 h-6 flex items-center justify-center bg-black/40 rounded text-[9px] font-bold hover:text-[#00f2ff] hover:border-[#00f2ff] border border-transparent transition-all"
                  >
                    B
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
