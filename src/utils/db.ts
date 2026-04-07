/**
 * SwingClips - IndexedDB Session Storage
 * Handles persistent storage of video blobs and notes.
 */

export interface SwingClip {
  blob: Blob;
  shotNote: string;
}

export interface Session {
  id: number; // Timestamp
  date: Date;
  sessionName?: string;
  sessionNotes: string;
  clips: SwingClip[];
}

const DB_NAME = 'SwingClipsDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
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
