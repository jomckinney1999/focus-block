/** Keeps a user's uploaded background (image or video) in this browser's IndexedDB. */
const DB = "undercurrent";
const STORE = "files";
const KEY = "background";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveBackgroundFile = (file: Blob) => run("readwrite", (s) => s.put(file, KEY)).catch(() => undefined);
export const loadBackgroundFile = () => run<Blob | undefined>("readonly", (s) => s.get(KEY)).catch(() => undefined);
export const clearBackgroundFile = () => run("readwrite", (s) => s.delete(KEY)).catch(() => undefined);
