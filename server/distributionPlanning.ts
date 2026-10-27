import type { Express } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppSessions } from './appSession';
import { apiError, ApiFailure } from './dataApi';
import { DateStringSchema } from '../src/schemas/reservationSchema';
import { getChileLocalDateString } from '../src/utils/dateUtils';
import { SPACES_LIST } from '../src/data/spacesData';
import { DEFAULT_EQUIPMENT_ITEMS } from '../src/data/equipmentData';
import { getEnabledSpaces } from '../src/utils/spaceAvailability';

export function validateDistributionDate(date: unknown): asserts date is string {
  if (!DateStringSchema.safeParse(date).success || (date as string) < getChileLocalDateString()) throw new ApiFailure(400, 'Elige una fecha válida desde hoy.');
}

export function registerDistributionPlanningApi(app: Express, db: Firestore, sessions: AppSessions) {
  app.post('/api/reservations/planning-snapshot', sessions.requireAuth, async (req, res) => {
    try {
      const date = req.body.fecha;
      validateDistributionDate(date);
      const previous = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      // Fail as a unit; never turn a failed query into a seemingly empty agenda.
      const [reservations, blocks, spaces, equipment] = await Promise.all([
        db.collection('reservas').where('fecha', '>=', previous).where('fecha', '<=', date).get(),
        db.collection('bloqueos_espacios').where('fechaFin', '>=', date).get(),
        db.doc('configuracion_sistema/espacios').get(),
        db.doc('configuracion_sistema/equipamiento').get(),
      ]);
      res.json({ success: true, snapshot: {
        fecha: date, loadedAt: new Date().toISOString(),
        reservations: reservations.docs.map(doc => ({ ...doc.data(), id: doc.id })),
        blocks: blocks.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter((b: any) => b.fechaInicio <= date),
        spaces: getEnabledSpaces(spaces.exists && Array.isArray(spaces.get('data')) ? spaces.get('data') : SPACES_LIST),
        equipment: equipment.exists && Array.isArray(equipment.get('items')) ? equipment.get('items') : DEFAULT_EQUIPMENT_ITEMS,
      } });
    } catch (error) { apiError(res, error); }
  });
}
