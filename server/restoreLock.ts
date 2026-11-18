import type { Express } from 'express';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { AppSessions } from './appSession';

export const restoreLockPath = '_maintenance/backup_restore';
export const restorePauseMessage = 'Hay una restauración en curso. Reanúdala desde respaldos antes de modificar los datos.';

export function registerRestoreWriteGuard(app: Express, db: Firestore, sessions: AppSessions) {
  const paths = new Set([
    '/api/data/write', '/api/users/save', '/api/users/delete', '/api/users/password',
    '/api/ratings/delete', '/api/ratings/validate-and-save', '/api/reservations/cake-stock/adjust',
    '/api/backups/entities', '/api/admin/purge-expired-slots',
  ]);
  const inventoryWrites = new Set(['/api/inventario/crear-lugar', '/api/inventario/eliminar-lugar', '/api/inventario/guardar-articulo']);
  app.use((req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/$/, '');
    if (req.method !== 'POST' || (!paths.has(path) && !inventoryWrites.has(path))) return next();
    return sessions.requireAuth(req, res, async () => {
      try {
        if ((await db.doc(restoreLockPath).get()).get('active')) return res.status(409).json({ success: false, error: restorePauseMessage });
        return next();
      } catch {
        return res.status(503).json({ success: false, error: 'No se pudo consultar el estado de mantenimiento.' });
      }
    });
  });
}

export async function reservationWritesPaused(db: Firestore, tx: Transaction, restoreId?: string, attempt?: string) {
  const job = (await tx.get(db.doc(restoreLockPath))).data();
  return restoreId
    ? !job?.active || job.id !== restoreId || job.attempt !== attempt
    : Boolean(job?.active);
}
