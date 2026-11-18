import type { Express } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { Reservation } from '../src/types';
import { isEligibleForRating } from '../src/utils/ratingEligibility';
import { reservationPermission } from '../src/utils/userPermissions';
import { canReadReservationPersonalData, projectAgendaRecord } from '../src/utils/reservationPrivacy';
import type { AppSessions } from './appSession';
import { accountId, ApiFailure, apiError, requireManager } from './dataApi';
import { buildConfirmedRating, reservationEndDate } from './ratingValidation';

const collection = 'calificaciones_espacios';
function documentId(value: unknown): value is string {
  return typeof value === 'string' && /^[^/]{1,128}$/.test(value) && value !== '.' && value !== '..';
}

export function registerRatingApi(app: Express, db: Firestore, sessions: AppSessions,
  santiagoTime: () => { dateStr: string; timeFormatted: string }) {
  for (const action of ['validate-and-save', 'delete'] as const) {
    app.post(`/api/ratings/${action}`, sessions.requireAuth, async (req, res) => {
      try {
        const username = (req as any).user.username;
        const input = req.body?.rating;
        const id = action === 'delete' ? req.body?.ratingId : input?.id ?? randomUUID();
        const reservationId = input?.reservationId || input?.reservaId;
        if (!documentId(id) || (action !== 'delete' && !documentId(reservationId))) {
          throw new ApiFailure(400, 'Identificador de evaluación o reserva no válido.');
        }
        const rating = await db.runTransaction(async tx => {
          const account = (await tx.get(db.doc(`usuarios_sistema/${accountId(username)}`))).data();
          if (!sessions.acceptsAccount(req.get('authorization') || '', account as any)) {
            throw new ApiFailure(401, 'La sesión cambió.');
          }
          if (action === 'delete') requireManager(account);
          else if (!reservationPermission(account, 'canCreateReservations') && !reservationPermission(account, 'canEditReservations')) {
            throw new ApiFailure(403, 'Tu cuenta no puede guardar evaluaciones.');
          }
          const ref = db.collection(collection).doc(id);
          const before = (await tx.get(ref)).data();
          const audit = db.collection('audit_logs').doc();
          const timestamp = new Date().toISOString();
          if (action === 'delete') {
            if (before) {
              tx.delete(ref);
              tx.create(audit, { id: audit.id, action: 'RATING_DELETED', user: username, timestamp, ratingId: id });
            }
            return undefined;
          }
          const snapshot = await tx.get(db.collection('reservas').doc(reservationId));
          if (!snapshot.exists) throw new ApiFailure(404, 'No se encontró la reserva oficial.');
          const reservation = { ...snapshot.data(), id: snapshot.id } as Reservation;
          if (!isEligibleForRating(reservation)) throw new ApiFailure(400, 'Esta actividad no corresponde a un préstamo de cumpleaños evaluable.');
          const now = santiagoTime();
          const end = reservationEndDate(reservation);
          if (end > now.dateStr || (end === now.dateStr && reservation.horaFin > now.timeFormatted)) {
            throw new ApiFailure(400, 'La actividad todavía no termina.');
          }
          if (before && (before.reservationId ?? before.reservaId) !== reservationId) {
            throw new ApiFailure(409, 'La evaluación corresponde a otra reserva.');
          }
          const saved = {
            ...buildConfirmedRating(input, reservation, id, username, timestamp),
            auxiliarName: account?.name || username,
            telefonoContacto: reservation.telefonoContacto || '',
            emailContacto: reservation.emailContacto || '',
            esCumpleanos: true,
            createdAt: before?.createdAt ?? timestamp,
            createdBy: before?.createdBy ?? username,
          };
          tx.set(ref, saved);
          tx.create(audit, { id: audit.id, action: before ? 'RATING_UPDATED' : 'RATING_CREATED',
            user: username, timestamp, ratingId: id, reservaId: reservationId });
          return saved;
        });
        const actor = (req as any).user;
        res.set('Cache-Control', 'no-store').json({ success: true, ...(rating && {
          valid: true, ratingId: rating.id,
          rating: canReadReservationPersonalData(actor) ? rating : projectAgendaRecord(collection, rating),
        }) });
      } catch (error) {
        apiError(res, error);
      }
    });
  }
}
