import { describe, expect, it } from 'vitest';
import { canonicalJson, randomToken, sha256, signPayload, verifyPayload } from '../../src/lib/crypto.js';

describe('canonicalJson', () => {
  it('is independent of key insertion order (nested)', () => {
    const a = { b: 1, a: { d: [3, { y: 1, x: 2 }], c: 'x' } };
    const b = { a: { c: 'x', d: [3, { x: 2, y: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[3,{"x":2,"y":1}]},"b":1}');
  });

  it('uses code-unit (locale-independent) key order', () => {
    expect(canonicalJson({ b: 1, a: 2, B: 3, _: 4, aZ: 5, ab: 6 })).toBe('{"B":3,"_":4,"a":2,"aZ":5,"ab":6,"b":1}');
  });

  it('keeps array order and drops undefined properties like JSON.stringify', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });

  it('serializes Dates like JSON.stringify instead of as {}', () => {
    const d = new Date('2026-09-26T00:00:00.000Z');
    expect(canonicalJson({ at: d })).toBe('{"at":"2026-09-26T00:00:00.000Z"}');
    expect(canonicalJson({ at: d })).not.toBe(canonicalJson({ at: new Date('2020-01-01T00:00:00Z') }));
  });

  it('escapes strings and handles primitives', () => {
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
    expect(canonicalJson(1.5)).toBe('1.5');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
  });

  it('produces stable hashes for equal content', () => {
    expect(sha256(canonicalJson({ x: 1, y: [1, 2] }))).toBe(sha256(canonicalJson({ y: [1, 2], x: 1 })));
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('signPayload / verifyPayload', () => {
  it('round-trips a payload', () => {
    const t = signPayload({ d: 'doc1', u: 'user1', exp: 123 });
    expect(verifyPayload(t)).toEqual({ d: 'doc1', u: 'user1', exp: 123 });
  });

  it('detects a tampered payload', () => {
    const t = signPayload({ d: 'doc1', u: 'user1', exp: 123 });
    const [, sig] = t.split('.');
    const forged = `${Buffer.from(JSON.stringify({ d: 'doc2', u: 'user1', exp: 123 })).toString('base64url')}.${sig}`;
    expect(verifyPayload(forged)).toBeNull();
  });

  it('detects a tampered signature', () => {
    const t = signPayload({ a: 1 });
    const last = t.at(-1) === 'A' ? 'B' : 'A';
    expect(verifyPayload(`${t.slice(0, -1)}${last}`)).toBeNull();
    expect(verifyPayload(`${t.split('.')[0]}.`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    for (const t of ['', 'abc', '.', 'a.b.c', 'eyJ9.' + 'x'.repeat(43)]) expect(verifyPayload(t)).toBeNull();
  });
});

describe('randomToken', () => {
  it('is url-safe and unique', () => {
    const a = randomToken(24);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(new Set(Array.from({ length: 50 }, () => randomToken())).size).toBe(50);
  });
});
