import crypto from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import type { DocumentType, DocumentVisibility, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/env.js';
import { AppError, notFound } from '../lib/errors.js';
import { signPayload, verifyPayload } from '../lib/crypto.js';
import { providers } from '../providers/index.js';
import { audit } from './audit.service.js';
import { assertPatientAccess, portalPatientIds } from './access/patientAccess.js';
import { hasPermission, inFacilityScope, type Principal } from './auth/principal.js';

/** Allow-list: declared MIME ↔ extensions ↔ detected magic-byte type must all agree. */
const ALLOWED: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/')).normalize('NFKC');
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim();
  const trimmed = cleaned.replace(/^\.+/, '').slice(-100);
  return trimmed || 'document';
}

export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export async function validateUpload(file: IncomingFile | undefined): Promise<{ filename: string; mimeType: string }> {
  if (!file) throw new AppError('VALIDATION_ERROR', 'Please choose a file to upload.');
  if (file.size === 0) throw new AppError('FILE_REJECTED', 'The file is empty.');
  if (file.size > config.UPLOAD_MAX_BYTES) throw new AppError('FILE_TOO_LARGE', `Files must be smaller than ${Math.round(config.UPLOAD_MAX_BYTES / 1_048_576)} MB.`);
  const filename = sanitizeFilename(file.originalname);
  const ext = path.extname(filename).toLowerCase();
  const allowedExt = ALLOWED[file.mimetype];
  if (!allowedExt || !allowedExt.includes(ext)) {
    throw new AppError('FILE_REJECTED', 'Only PDF, PNG and JPEG files are accepted.');
  }
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || detected.mime !== file.mimetype) {
    throw new AppError('FILE_REJECTED', 'The file content does not match its type. Only genuine PDF, PNG and JPEG files are accepted.');
  }
  return { filename, mimeType: detected.mime };
}

const storageKey = (patientId: string) => `patients/${patientId}/${crypto.randomUUID()}`;

export async function storeGeneratedDocument(input: {
  patientId: string;
  encounterId?: string | null;
  type: DocumentType;
  title: string;
  filename: string;
  mimeType: string;
  body: Buffer;
  uploadedById: string;
  visibility?: DocumentVisibility;
}) {
  const stored = await providers.storage.upload({ key: storageKey(input.patientId), body: input.body, contentType: input.mimeType });
  return prisma.medicalDocument.create({
    data: {
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      type: input.type,
      title: input.title,
      storageKey: stored.key,
      originalFilename: sanitizeFilename(input.filename),
      mimeType: input.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      visibility: input.visibility ?? 'PATIENT_VISIBLE',
      uploadedById: input.uploadedById,
    },
  });
}

export async function uploadDocument(
  p: Principal,
  input: { patientId: string; type: DocumentType; title?: string | undefined; encounterId?: string | undefined; visibility?: DocumentVisibility | undefined },
  file: IncomingFile | undefined,
) {
  const portal = await portalPatientIds(p, 'clinical');
  const isPortal = portal.includes(input.patientId);
  if (!isPortal) {
    if (!hasPermission(p, 'document:upload')) throw new AppError('FORBIDDEN', 'You cannot upload documents.');
    await assertPatientAccess(p, input.patientId, hasPermission(p, 'clinical:write') ? 'clinical' : 'demographics');
  }
  const { filename, mimeType } = await validateUpload(file);
  const type = isPortal ? 'PATIENT_UPLOAD' : input.type;
  const doc = await storeGeneratedDocument({
    patientId: input.patientId,
    encounterId: input.encounterId ?? null,
    type,
    title: input.title?.trim() || filename,
    filename,
    mimeType,
    body: (file as IncomingFile).buffer,
    uploadedById: p.userId,
    visibility: isPortal ? 'PATIENT_VISIBLE' : input.visibility ?? 'PATIENT_VISIBLE',
  });
  await audit({ actor: p, action: 'document.upload', resourceType: 'MedicalDocument', resourceId: doc.id, after: { patientId: input.patientId, type, sizeBytes: doc.sizeBytes } });
  return publicDoc(doc);
}

const publicDoc = (d: { id: string; patientId: string; encounterId: string | null; type: DocumentType; title: string; originalFilename: string; mimeType: string; sizeBytes: number; visibility: DocumentVisibility; createdAt: Date }) => ({
  id: d.id,
  patientId: d.patientId,
  encounterId: d.encounterId,
  type: d.type,
  title: d.title,
  filename: d.originalFilename,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  visibility: d.visibility,
  createdAt: d.createdAt,
});

/** Lab reports are visible to patients only after release. */
async function releasedLabDocIds(patientId: string) {
  const reports = await prisma.labReport.findMany({ where: { order: { patientId }, documentId: { not: null } }, select: { documentId: true, order: { select: { releasedToPatientAt: true } } } });
  return {
    released: new Set(reports.filter((r) => r.order.releasedToPatientAt).map((r) => r.documentId as string)),
    all: new Set(reports.map((r) => r.documentId as string)),
  };
}

export async function listDocuments(p: Principal, patientId: string, type?: DocumentType) {
  const portal = await portalPatientIds(p, 'clinical');
  const isPortal = portal.includes(patientId);
  if (!isPortal) await assertPatientAccess(p, patientId, 'clinical');
  const where: Prisma.MedicalDocumentWhereInput = { patientId, deletedAt: null, ...(type ? { type } : {}), ...(isPortal ? { visibility: 'PATIENT_VISIBLE' } : {}) };
  const docs = await prisma.medicalDocument.findMany({ where, orderBy: { createdAt: 'desc' } });
  if (!isPortal) return docs.map(publicDoc);
  const lab = await releasedLabDocIds(patientId);
  return docs.filter((d) => !lab.all.has(d.id) || lab.released.has(d.id)).map(publicDoc);
}

async function authorizeDocument(p: Principal, docId: string) {
  const doc = await prisma.medicalDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.deletedAt) throw notFound('Document');
  const portal = await portalPatientIds(p, 'clinical');
  if (portal.includes(doc.patientId)) {
    if (doc.visibility !== 'PATIENT_VISIBLE') throw notFound('Document');
    const lab = await releasedLabDocIds(doc.patientId);
    if (lab.all.has(doc.id) && !lab.released.has(doc.id)) throw notFound('Document');
    return doc;
  }
  if (hasPermission(p, 'investigation:process')) {
    const report = await prisma.labReport.findFirst({ where: { documentId: doc.id }, include: { order: { select: { facilityId: true } } } });
    if (report && inFacilityScope(p, report.order.facilityId)) return doc;
  }
  if (!hasPermission(p, 'document:read')) throw new AppError('FORBIDDEN', 'You do not have access to this document.');
  await assertPatientAccess(p, doc.patientId, 'clinical');
  return doc;
}

/** Authenticated + authorized request → short-lived, user-bound download URL. */
export async function createDownloadUrl(p: Principal, docId: string) {
  const doc = await authorizeDocument(p, docId);
  const expiresAt = Date.now() + config.DOWNLOAD_URL_TTL_SECONDS * 1000;
  const token = signPayload({ d: doc.id, u: p.userId, exp: expiresAt });
  await audit({ actor: p, action: 'document.url_issued', resourceType: 'MedicalDocument', resourceId: doc.id });
  return { url: `/api/documents/download/${token}`, expiresAt: new Date(expiresAt).toISOString() };
}

export async function resolveDownload(p: Principal, token: string) {
  const payload = verifyPayload<{ d: string; u: string; exp: number }>(token);
  if (!payload) throw new AppError('NOT_FOUND', 'Document not found.');
  if (payload.exp < Date.now()) throw new AppError('LINK_EXPIRED', 'This download link has expired. Please open the document again.');
  if (payload.u !== p.userId) throw new AppError('FORBIDDEN', 'This download link was issued to a different user.');
  const doc = await authorizeDocument(p, payload.d);
  const body = await providers.storage.download(doc.storageKey);
  await audit({ actor: p, action: 'document.access', resourceType: 'MedicalDocument', resourceId: doc.id });
  return { doc, body };
}
