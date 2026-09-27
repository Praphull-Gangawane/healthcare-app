import { sha256 } from '../../lib/crypto.js';
import type { StorageProvider, StoredFile, UploadInput } from './types.js';

/** In-memory storage for tests. */
export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock';
  private readonly files = new Map<string, Buffer>();

  upload({ key, body }: UploadInput): Promise<StoredFile> {
    this.files.set(key, Buffer.from(body));
    return Promise.resolve({ key, sizeBytes: body.length, sha256: sha256(body) });
  }

  download(key: string): Promise<Buffer> {
    const f = this.files.get(key);
    return f ? Promise.resolve(f) : Promise.reject(new Error('Not found'));
  }

  remove(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}
