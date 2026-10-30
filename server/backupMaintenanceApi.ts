import type { Express } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { AppSessions } from './appSession';
import { accountId, ApiFailure, apiError, requireManager } from './dataApi';
import { isReservationPermissionAdmin } from '../src/utils/userPermissions';
import { automaticBackupsToRotate } from '../src/utils/maintenanceDiagnostics';

export function registerBackupMaintenanceApi(app: Express, db: Firestore, sessions: AppSessions, slotStatus?: () => unknown) {
  app.post('/api/maintenance/status', sessions.requireAuth, async (req, res) => {
    try {
      requireManager((req as any).user);
      const [backups, logs] = await Promise.all([
        db.collection('copias_seguridad').select('timestamp', 'fecha', 'tipo', 'totalReservas', 'tamanoBytes', 'checksum', 'protected')
          .orderBy('timestamp', 'desc').limit(50).get(),
        db.collection('maintenance_logs').orderBy('timestamp', 'desc').limit(10).get(),
      ]);
      res.set('Cache-Control', 'no-store').json({ success: true, checkedAt: new Date().toISOString(),
        slotCleanup: slotStatus?.() ?? null,
        backups: backups.docs.map(doc => ({ ...doc.data(), id: doc.id, storageStatus: 'firestore_confirmed' })),
        limited: backups.size === 50, logs: logs.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
    } catch (error) { apiError(res, error); }
  });
  for (const action of ['protect', 'delete'] as const) {
    app.post(`/api/maintenance/backups/${action}`, sessions.requireAuth, async (req, res) => {
      try {
        const actor = (req as any).user;
        if (!isReservationPermissionAdmin(actor)) throw new ApiFailure(403, 'Solo Cristian Shute puede administrar la conservación de respaldos.');
        const { backupId, protected: protection, mode } = req.body;
        if (typeof backupId !== 'string' || !/^[\w-]{1,180}$/.test(backupId)) throw new ApiFailure(400, 'Identificador de respaldo no válido.');
        if (action === 'protect' && typeof protection !== 'boolean') throw new ApiFailure(400, 'Indica si la copia debe quedar protegida.');
        await db.runTransaction(async tx => {
          const ref = db.doc(`copias_seguridad/${backupId}`);
          const [account, snapshot] = await Promise.all([
            tx.get(db.doc(`usuarios_sistema/${accountId(actor.username)}`)), tx.get(ref),
          ]);
          if (!sessions.acceptsAccount(req.get('authorization') || '', account.data() as any) || !isReservationPermissionAdmin(account.data()))
            throw new ApiFailure(403, 'La sesión o sus permisos cambiaron. Actualiza la sesión.');
          if (!snapshot.exists) throw new ApiFailure(404, 'La copia ya no está disponible.');
          if (action === 'protect') {
            if (snapshot.get('protected') === protection) return;
            tx.update(ref, { protected: protection });
          } else {
            if (snapshot.get('protected') === true) throw new ApiFailure(409, 'La copia está protegida y no puede eliminarse.');
            const backupsCol: any = db.collection('copias_seguridad');
            const backupsQuery = typeof backupsCol.select === 'function'
              ? backupsCol.select('timestamp', 'fecha', 'tipo', 'totalReservas', 'tamanoBytes', 'checksum', 'protected')
              : backupsCol;
            const [backups, parts] = await Promise.all([
              tx.get(backupsQuery), tx.get(ref.collection('partes').limit(401)),
            ]);
            if (backups.size <= 1) throw new ApiFailure(409, 'Se conserva la última copia disponible.');
            if (parts.size > 400) throw new ApiFailure(413, 'Esta copia requiere una eliminación supervisada por su tamaño.');
            if (mode === 'rotation' && !automaticBackupsToRotate(backups.docs.map(doc => ({ ...doc.data(), id: doc.id } as any))).some(row => row.id === backupId))
              throw new ApiFailure(409, 'Esta copia debe conservarse según la política de retención.');
            parts.docs.forEach(part => tx.delete(part.ref));
            tx.delete(ref);
          }
          tx.create(db.doc(`maintenance_logs/${randomUUID()}`), { timestamp: new Date().toISOString(), actor: actor.username,
            action: action === 'delete' ? 'backup_deleted' : protection ? 'backup_protected' : 'backup_unprotected', backupId });
        });
        res.json({ success: true });
      } catch (error) { apiError(res, error); }
    });
  }
}
