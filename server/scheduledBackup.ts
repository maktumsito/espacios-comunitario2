import type { Express } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { publicProfile } from './passwords';
import { splitBackupPayload } from '../src/utils/backupChunks';
import { backupChecksum, validateBackupRecord } from '../src/utils/backupIntegrity';

const schedulePath = 'configuracion_sistema/backup_schedule_config';
const leaseMs = 30 * 60_000;

export async function createScheduledBackup(db: Firestore, beforeRestore = false) {
  const schedule = db.doc(schedulePath);
  const id = `automatico_${randomUUID()}`;
  const started = Date.now();
  const lease = await db.runTransaction(async tx => {
    const current = (await tx.get(schedule)).data();
    const days = Number(current?.data?.intervalDays) || 15;
    if (!beforeRestore && (current?.data?.enabled === false ||
      started - (Number(current?.data?.lastBackupTimestamp) || 0) < days * 86_400_000)) return null;
    if (current?.lease?.expiresAt > started) return null;
    tx.set(schedule, { lease: { owner: id, expiresAt: started + leaseMs } }, { merge: true });
    return id;
  });
  if (!lease) return null;
  try {
    const timestamp = new Date().toISOString();
    const fecha = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date(timestamp));
    const data = await db.runTransaction(async tx => {
      const collection = async (name: string) => (await tx.get(db.collection(name))).docs
        .map(doc => ({ ...doc.data(), id: doc.id }));
      const config = async (name: string, field = 'data') => {
        const items = (await tx.get(db.doc(`configuracion_sistema/${name}`))).get(field);
        if (!Array.isArray(items)) throw new Error(`No se encontró el catálogo ${name}.`);
        return items;
      };
      const [reservas, espacios, tiposPrestamo, tiposActividad, equipamiento, accounts, calificaciones, bloqueos, locations, stock] =
        await Promise.all([
          collection('reservas'), config('espacios'), config('tipos_prestamo'), config('tipos_actividad'),
          config('equipamiento', 'items'), collection('usuarios_sistema'), collection('calificaciones_espacios'),
          collection('bloqueos_espacios'), tx.get(db.collection('inventario_lugares')),
          tx.get(db.doc('_reservation_inventory/cakes_2026_2027')),
        ]);
      const inventario = [];
      for (const location of locations.docs) {
        const generation = location.get('generation');
        const articles = await tx.get(location.ref.collection(generation ? `articulos_${generation}` : 'articulos'));
        inventario.push({ id: location.id, data: location.data(),
          articulos: articles.docs.map(article => ({ id: article.id, data: article.data() })) });
      }
      const usuarios = accounts.map(account => publicProfile(account as any));
      return { version: '3.0.0', exportadoEn: timestamp, reservas, espacios, tiposPrestamo, tiposActividad,
        equipamiento, usuarios, calificaciones, bloqueos, inventario, stockTortas: stock.data() ?? null };
    }, { readOnly: true });
    const serialized = JSON.stringify(data);
    const parts = splitBackupPayload(serialized);
    if (parts.length > 400) throw new Error('La copia supera el límite de fragmentos.');
    const metadata = { id, timestamp, fecha, tipo: beforeRestore ? 'manual' : 'automatica_15_dias',
      creadoPor: beforeRestore ? 'Restauración del sistema' : 'Programador de respaldos',
      descripcion: beforeRestore ? 'Copia previa a una restauración' : 'Respaldo automático del servidor',
      checksum: await backupChecksum(serialized),
      tamanoBytes: Buffer.byteLength(serialized), totalPartes: parts.length, esChunked: true,
      totalReservas: data.reservas.length, totalEspacios: data.espacios.length, totalEquipamiento: data.equipamiento.length,
      totalUsuarios: data.usuarios.length, totalCalificaciones: data.calificaciones.length };
    await validateBackupRecord({ ...metadata, data }, parts.join(''));

    const backup = db.collection('copias_seguridad').doc(id);
    for (let offset = 0; offset < parts.length; offset += 8) {
      const batch = db.batch();
      for (const [index, payload] of parts.slice(offset, offset + 8).entries()) {
        const part = offset + index;
        batch.create(backup.collection('partes').doc(`parte_${String(part).padStart(3, '0')}`), {
          id: `parte_${String(part).padStart(3, '0')}`, backupId: id, index: part, totalPartes: parts.length, payload,
        });
      }
      await batch.commit();
    }
    await db.runTransaction(async tx => {
      const current = (await tx.get(schedule)).data();
      if (current?.lease?.owner !== id) throw new Error('La ejecución perdió su bloqueo.');
      tx.create(backup, metadata);
      tx.set(schedule, { ...(!beforeRestore && { data: { lastBackupId: id, lastBackupDate: fecha, lastBackupTimestamp: Date.parse(timestamp) } }),
        lease: null, updatedAt: timestamp }, { merge: true });
    });
    return id;
  } catch (error) {
    await db.runTransaction(async tx => {
      if ((await tx.get(schedule)).get('lease.owner') === id) tx.update(schedule, { lease: null });
    });
    throw error;
  }
}

export function registerScheduledBackup(app: Express, db: Firestore) {
  const verifier = new OAuth2Client();
  app.post('/api/backups/scheduled-check', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const audience = process.env.BACKUP_SCHEDULER_AUDIENCE;
    const subject = process.env.BACKUP_SCHEDULER_SUBJECT;
    if (!audience || !subject) return res.status(503).json({ success: false, error: 'Programador de respaldos sin configurar.' });
    const match = /^Bearer (\S+)$/i.exec(req.get('authorization') || '');
    try {
      if (!match) throw new Error('Credencial ausente.');
      const ticket = await verifier.verifyIdToken({ idToken: match[1], audience });
      if (ticket.getPayload()?.sub !== subject) throw new Error('Identidad no autorizada.');
    } catch {
      return res.status(401).json({ success: false, error: 'Programador no autorizado.' });
    }
    try {
      const id = await createScheduledBackup(db);
      return res.json({ success: true, skipped: !id, ...(id && { id }) });
    } catch {
      return res.status(503).json({ success: false, error: 'No se confirmó el respaldo programado.' });
    }
  });
}
