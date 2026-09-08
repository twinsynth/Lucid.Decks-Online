// IndexedDB persistence for Lucid Decks audio library

export interface StoredTrack {
  id: string;
  name: string;
  size: number;
  type: string;
  blob: Blob;
  duration?: number;
  bpm?: number;
  peaks?: number[];
  hotCues?: (number | null)[];
  dateAdded: number;
  source: 'local' | 'stream' | 'ai' | 'drive';
}

const DB_NAME = 'LucidDecksLibraryDB';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('dateAdded', 'dateAdded', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

export async function saveTrackToDB(
  fileOrBlob: File | Blob,
  metadata: {
    id?: string;
    name?: string;
    duration?: number;
    bpm?: number;
    peaks?: number[];
    hotCues?: (number | null)[];
    source?: 'local' | 'stream' | 'ai' | 'drive';
  } = {}
): Promise<StoredTrack> {
  const db = await getDB();
  const name = metadata.name || (fileOrBlob instanceof File ? fileOrBlob.name : `Track_${Date.now()}`);
  const id = metadata.id || `${name}_${fileOrBlob.size}_${Date.now()}`;

  const track: StoredTrack = {
    id,
    name,
    size: fileOrBlob.size,
    type: fileOrBlob.type || 'audio/mpeg',
    blob: fileOrBlob,
    duration: metadata.duration || 0,
    bpm: metadata.bpm || 120,
    peaks: metadata.peaks || [],
    hotCues: metadata.hotCues || [null, null, null, null],
    dateAdded: Date.now(),
    source: metadata.source || 'local'
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(track);

    request.onsuccess = () => resolve(track);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllTracksFromDB(): Promise<StoredTrack[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results: StoredTrack[] = request.result || [];
      // Sort newest first
      results.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getTrackFromDB(id: string): Promise<StoredTrack | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTrackFromDB(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateTrackHotCuesInDB(id: string, hotCues: (number | null)[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const track: StoredTrack | undefined = getReq.result;
      if (!track) return resolve();
      track.hotCues = hotCues;
      const putReq = store.put(track);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function updateTrackAnalysisInDB(
  id: string,
  analysis: { duration?: number; bpm?: number; peaks?: number[] }
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const track: StoredTrack | undefined = getReq.result;
      if (!track) return resolve();
      if (analysis.duration !== undefined) track.duration = analysis.duration;
      if (analysis.bpm !== undefined) track.bpm = analysis.bpm;
      if (analysis.peaks !== undefined) track.peaks = analysis.peaks;
      const putReq = store.put(track);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function clearAllTracksFromDB(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getStorageEstimate(): Promise<{ usedMB: string; quotaMB: string }> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
      const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
      return { usedMB, quotaMB };
    } catch {
      // Fallback
    }
  }
  return { usedMB: '0.0', quotaMB: 'N/A' };
}
