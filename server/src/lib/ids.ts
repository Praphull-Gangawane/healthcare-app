import type { Tx, Db } from './prisma.js';

/** Atomically increments and returns a named counter (safe under concurrency). */
export async function nextSequence(db: Tx | Db, key: string): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "IdSequence" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "IdSequence"."value" + 1
    RETURNING "value"`;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error('Sequence allocation failed');
  return Number(value);
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export async function nextUhid(db: Tx | Db, org: { id: string; uhidPrefix: string; uhidPadding: number }) {
  const n = await nextSequence(db, `uhid:${org.id}`);
  return `${org.uhidPrefix}-${pad(n, org.uhidPadding)}`;
}

type NumberKind = 'APT' | 'ENC' | 'RX' | 'ORD' | 'INV';

export async function nextNumber(db: Tx | Db, kind: NumberKind, at: Date = new Date()): Promise<string> {
  const year = at.getUTCFullYear();
  const n = await nextSequence(db, `${kind}:${year}`);
  return `${kind}-${year}-${pad(n, 6)}`;
}
