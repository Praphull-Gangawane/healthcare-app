export interface StoredFile {
  key: string;
  sizeBytes: number;
  sha256: string;
}

export interface UploadInput {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Object storage abstraction. Objects are always private — access is brokered by the API, which
 * authorizes the caller and then issues a short-lived signed download URL (see document.service).
 */
export interface StorageProvider {
  readonly name: string;
  upload(input: UploadInput): Promise<StoredFile>;
  download(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
