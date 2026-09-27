import type { Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from './errors.js';

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json(meta ? { success: true, data, meta } : { success: true, data });
}

function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Some of the information provided is invalid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data as z.infer<S>;
}

export const parseBody = <S extends ZodTypeAny>(schema: S, req: Request) => parse(schema, req.body ?? {});
export const parseQuery = <S extends ZodTypeAny>(schema: S, req: Request) => parse(schema, req.query);
export const parseParams = <S extends ZodTypeAny>(schema: S, req: Request) => parse(schema, req.params);

/** Route param helper (Express 5 params are string | string[]). */
export function param(req: Request, name: string): string {
  const v = req.params[name];
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) throw new AppError('VALIDATION_ERROR', `Missing parameter: ${name}`);
  return s;
}

export interface Page {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageMeta(page: Page, total: number) {
  return { page: page.page, pageSize: page.pageSize, total, totalPages: Math.ceil(total / page.pageSize) };
}
