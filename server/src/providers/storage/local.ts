import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../../lib/crypto.js';
import type { StorageProvider, StoredFile, UploadInput } from './types.js';

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,200}$/;

/** Filesystem storage outside the source tree (STORAGE_LOCAL_DIR). Keys are server-generated. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async upload({ key, body }: UploadInput): Promise<StoredFile> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, body, { mode: 0o600, flag: 'wx' });
    return { key, sizeBytes: body.length, sha256: sha256(body) };
  }

  download(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}
