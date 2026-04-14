/**
 * SwingClips - IndexedDB Session Storage
 * Handles persistent storage of video blobs and notes.
 */

export interface SwingClip {
  data: Uint8Array; // Using Uint8Array instead of Blob for better Safari/IndexedDB stability
  thumbnail?: string; // Base64 image string for stable thumbnails
  shotNote: string;
  isFavorite?: boolean;
}

export interface Session {
  id: number; // Timestamp
  date: Date;
  sessionName?: string;
  sessionNotes: string;
  clips: SwingClip[];
  thumbnailOffset?: number; // offset used when thumbnails were last generated; used to skip already-migrated sessions
}

const DB_NAME = 'SwingClipsDB';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';
const META_STORE = 'meta';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// App config stored in DB — represents the settings that were active when the
// user's data was last processed. Diffed against current env on each app load
// to trigger background migrations when settings change.
export interface AppConfig {
  thumbnailOffset: number;
}

export const getStoredConfig = async (): Promise<AppConfig | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readonly');
    const store = transaction.objectStore(META_STORE);
    const request = store.get('config');
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
};

export const saveStoredConfig = async (config: AppConfig): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readwrite');
    const store = transaction.objectStore(META_STORE);
    const request = store.put({ key: 'config', value: config });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const saveSession = async (session: Session): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(session);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getSession = async (id: number): Promise<Session | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllSessions = async (): Promise<Session[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by date descending (newest first)
      const sessions = request.result as Session[];
      sessions.sort((a, b) => b.id - a.id);
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteSession = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
