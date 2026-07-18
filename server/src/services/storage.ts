import crypto from 'crypto';

/**
 * Pluggable object storage. Production targets encrypted S3 (Canadian region);
 * this ships an in-memory stub so the document/upload flow is real and testable
 * without cloud credentials. Swap via setStorageProvider().
 *
 * Prescription scans and PII documents must be encrypted at rest — a real S3
 * provider sets SSE-KMS; sensitive blobs can additionally be run through
 * encryptField() before upload.
 */
export interface StoredObject {
  path: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer): Promise<StoredObject>;
  get(path: string): Promise<Buffer | null>;
}

class MemoryStorageProvider implements StorageProvider {
  readonly name = 'memory';
  private store = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<StoredObject> {
    const path = `mem://${key}`;
    this.store.set(path, data);
    return { path, sizeBytes: data.byteLength };
  }
  async get(path: string): Promise<Buffer | null> {
    return this.store.get(path) ?? null;
  }
}

let provider: StorageProvider = new MemoryStorageProvider();
export const getStorage = () => provider;
export const setStorageProvider = (p: StorageProvider) => {
  provider = p;
};

/** Build a collision-resistant storage key without needing Math.random. */
export function makeKey(prefix: string, filename: string): string {
  return `${prefix}/${crypto.randomBytes(16).toString('hex')}-${filename}`;
}
