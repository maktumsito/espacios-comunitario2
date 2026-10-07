import { createHash, timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';

export interface ScheduledDispatchResult {
  success: boolean;
  message: string;
  skipped?: boolean;
  error?: string;
}

// Share one in-flight check between the external scheduler and the local timer.
export function singleFlight<T>(execute: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(execute).finally(() => { pending = null; });
    }
    return pending;
  };
}

/** Failed deliveries retry after a bounded pause; skips and successful checks stay fresh. */
export function scheduledRetryGate<T extends ScheduledDispatchResult>(execute: () => Promise<T>, delayMs = 5 * 60_000) {
  let failure: { result: T; retryAt: number } | undefined;
  return singleFlight(async () => {
    if (failure && Date.now() < failure.retryAt) return failure.result;
    const result = await execute();
    failure = !result.success && !result.skipped ? { result, retryAt: Date.now() + delayMs } : undefined;
    return result;
  });
}

export function registerScheduledCheck(
  app: Express,
  getSecret: () => string | undefined,
  execute: (force: boolean) => Promise<ScheduledDispatchResult>
) {
  app.post('/api/email/scheduled-check', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const secret = getSecret();
    if (!secret || secret.length < 32) {
      res.status(503).json({ success: false, message: 'Programador externo no configurado.' });
      return;
    }
    const supplied = req.get('X-Scheduler-Token') || '';
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(secret), digest(supplied))) {
      res.status(401).json({ success: false, message: 'Acceso no autorizado.' });
      return;
    }
    try {
      // Never accept force from the caller. Keep the HTTP request alive until done
      // so request-based Cloud Run allocates CPU for PDF generation and delivery.
      const result = await execute(false);
      res.status(result.success || result.skipped ? 200 : 503).json({
        success: result.success, skipped: !!result.skipped, message: result.message
      });
    } catch {
      res.status(503).json({ success: false, message: 'Error al comprobar el despacho programado.' });
    }
  });
}
