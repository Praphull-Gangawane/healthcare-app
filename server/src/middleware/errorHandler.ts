import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getRequestContext } from '../lib/requestContext.js';

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError('FILE_TOO_LARGE', 'The file is larger than the allowed size.')
      : new AppError('FILE_REJECTED', 'The file could not be accepted.');
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return new AppError('INVALID_JSON', 'The request body is not valid JSON.');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError('CONFLICT', 'This record conflicts with an existing one.');
    if (err.code === 'P2025') return new AppError('NOT_FOUND', 'Resource not found.');
  }
  const status = (err as { status?: number; statusCode?: number })?.status;
  if (status === 413) return new AppError('FILE_TOO_LARGE', 'The request is too large.');
  return new AppError('INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const appErr = toAppError(err);
  const requestId = getRequestContext()?.requestId;
  if (appErr.status >= 500) {
    logger.error({ err, requestId, method: req.method, path: req.path }, 'unhandled error');
  } else {
    logger.debug({ code: appErr.code, requestId, path: req.path }, 'request rejected');
  }
  res.status(appErr.status).json({
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
}
