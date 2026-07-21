/**
 * Minimal IndexedDB wrapper — no library. A plain key-value object store with
 * promise-based get/getAll/put/delete has no "silently wrong" failure mode
 * the way hand-rolled QR/PDF encoding would, so it's not worth a dependency
 * for (matches this app's existing i18n/barcode precedent of only reaching
 * for a library when correctness is genuinely hard to get right from scratch).
 */

const DB_NAME = 'pms-offline';
const DB_VERSION = 1;

export const STORES = {
  cachedPrescriptions: 'cachedPrescriptions',
  pendingDispenses: 'pendingDispenses',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.cachedPrescriptions)) {
        db.createObjectStore(STORES.cachedPrescriptions, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.pendingDispenses)) {
        db.createObjectStore(STORES.pendingDispenses, { keyPath: 'idempotencyKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return promisify(tx.objectStore(storeName).getAll());
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await promisify(tx.objectStore(storeName).put(value));
}

export async function idbPutAll<T>(storeName: string, values: T[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await Promise.all(values.map((v) => promisify(store.put(v))));
}

export async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await promisify(tx.objectStore(storeName).delete(key));
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await promisify(tx.objectStore(storeName).clear());
}
