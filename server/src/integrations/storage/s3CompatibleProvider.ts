import { AppError } from '../../lib/errors.js';
import type { StorageProvider, StoredFile } from '../../providers/storage/types.js';

/**
 * S3-compatible object storage adapter (AWS S3, MinIO, etc.).
 * Status: PRODUCTION INTEGRATION PENDING. Implement with @aws-sdk/client-s3 (PutObject/GetObject/
 * DeleteObject) against a private bucket with SSE (server-side encryption) enabled and public
 * access blocked. Kept as an explicit stub so the app never silently falls back to insecure storage.
 */
export class S3CompatibleStorageProvider implements StorageProvider {
  readonly name = 's3';
  constructor(private readonly bucket: string | undefined) {}

  private notReady(): never {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `S3 storage adapter is not configured${this.bucket ? ` for bucket ${this.bucket}` : ''}.`,
    );
  }
  upload(): Promise<StoredFile> {
    return Promise.reject(this.notReady());
  }
  download(): Promise<Buffer> {
    return Promise.reject(this.notReady());
  }
  remove(): Promise<void> {
    return Promise.reject(this.notReady());
  }
}
