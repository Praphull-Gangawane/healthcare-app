import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config/env.js';
import { ok, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePrincipal } from '../middleware/auth.js';
import { id } from '../validators/common.js';
import * as docs from '../services/document.service.js';

export const documentsRouter = Router();
documentsRouter.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1, fields: 10 } });
const docType = z.enum(['PRESCRIPTION', 'LAB_REPORT', 'IMAGING_REPORT', 'REFERRAL_LETTER', 'DISCHARGE_SUMMARY', 'PATIENT_UPLOAD', 'OTHER']);

documentsRouter.get('/patients/:patientId', async (req, res) => {
  const q = parseQuery(z.object({ type: docType.optional() }), req);
  ok(res, await docs.listDocuments(requirePrincipal(req), param(req, 'patientId'), q.type));
});

documentsRouter.post('/', upload.single('file'), async (req, res) => {
  const body = parseBody(z.object({ patientId: id, type: docType.default('OTHER'), title: z.string().trim().max(150).optional(), encounterId: id.optional(), visibility: z.enum(['PATIENT_VISIBLE', 'CLINICAL_ONLY']).optional() }), req);
  ok(res, await docs.uploadDocument(requirePrincipal(req), body, req.file), 201);
});

/** Step 1: authorised request → short-lived, user-bound download URL. */
documentsRouter.get('/:id/url', async (req, res) => ok(res, await docs.createDownloadUrl(requirePrincipal(req), param(req, 'id'))));

/** Step 2: download (still requires the same authenticated user). */
documentsRouter.get('/download/:token', async (req, res) => {
  const { doc, body } = await docs.resolveDownload(requirePrincipal(req), param(req, 'token'));
  const inline = req.query.inline === '1' && doc.mimeType === 'application/pdf';
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${doc.originalFilename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.end(body);
});
