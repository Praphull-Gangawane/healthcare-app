export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ApiFailureBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

/** Decimal columns are serialized as strings by the API. */
export type DecimalString = string;
