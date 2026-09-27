import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal in-process metrics (extension point). Replace with Prometheus/OpenTelemetry exporters
 * in production. Tracks API latency and error counts per route class.
 */
const counters = new Map<string, number>();
const latency = new Map<string, { count: number; totalMs: number; maxMs: number }>();

export const metrics = {
  inc(name: string, by = 1) {
    counters.set(name, (counters.get(name) ?? 0) + by);
  },
  observe(name: string, ms: number) {
    const cur = latency.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    cur.count += 1;
    cur.totalMs += ms;
    cur.maxMs = Math.max(cur.maxMs, ms);
    latency.set(name, cur);
  },
  snapshot() {
    return {
      counters: Object.fromEntries(counters),
      latency: Object.fromEntries([...latency].map(([k, v]) => [k, { count: v.count, avgMs: Math.round(v.totalMs / v.count), maxMs: Math.round(v.maxMs) }])),
    };
  },
};

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const group = `${req.method} /api/${req.path.split('/')[2] ?? ''}`;
    metrics.observe(group, Number(process.hrtime.bigint() - start) / 1e6);
    if (res.statusCode >= 500) metrics.inc('http_5xx');
    else if (res.statusCode === 409 && req.path.startsWith('/api/appointments')) metrics.inc('appointment_booking_conflicts');
  });
  next();
}
