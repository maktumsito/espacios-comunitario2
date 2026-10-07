import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { collection, getDocsFromServer, getFirestore, terminate } from 'firebase/firestore';
import type { Reservation } from '../src/types';
import { getChileLocalDateString } from '../src/utils/dateUtils';
import { planIndependentReservationGroups, applyIndependentReservationGroup, groupingPatch, groupingRevision } from '../src/services/migrations/groupIndependentReservations';

const apply = process.argv.includes('--apply');
const actorIndex = process.argv.indexOf('--actor');
const actor = actorIndex >= 0 ? process.argv[actorIndex + 1] : '';
if (apply && !actor) throw new Error('Para aplicar, indica --actor con el nombre del solicitante.');
const config = JSON.parse(readFileSync(resolve('firebase-applet-config.json'), 'utf8'));
const db = getFirestore(initializeApp(config, 'independent-grouping'), config.firestoreDatabaseId || '(default)');
const today = getChileLocalDateString();
try {
  const snapshot = await getDocsFromServer(collection(db, 'reservas'));
  const rows = snapshot.docs.map(document => ({ ...document.data(), id: document.id } as Reservation));
  const groups = planIndependentReservationGroups(rows, today);
  const folder = resolve('work/recurring-grouping');
  mkdirSync(folder, { recursive: true });
  const run = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = resolve(folder, `${run}-${apply ? 'apply' : 'preview'}.json`);
  writeFileSync(backup, JSON.stringify({ projectId: config.projectId, databaseId: config.firestoreDatabaseId,
    today, apply, actor, groups }, null, 2));
  console.log(JSON.stringify({ reservationsRead: rows.length, pendingReservationsRead: rows.filter(row => row.fecha >= today).length, groups: groups.length,
    sessionsToGroup: groups.reduce((total, group) => total + group.reservations.length, 0), backup,
    activities: groups.map(group => ({ name: group.reservations[0].descripcion, weekday: group.weekday,
      start: group.reservations[0].horaInicio, end: group.reservations[0].horaFin,
      sessions: group.reservations.length, dates: new Set(group.reservations.map(row => row.fecha)).size })) }, null, 2));
  if (apply) {
    // Reject an oversized group before applying any other group.
    if (groups.some(group => group.reservations.length > 400)) throw new Error('Hay un grupo de más de 400 reservas. No se inició la agrupación.');
    let applied = 0;
    for (const group of groups) {
      if (await applyIndependentReservationGroup(db, group, actor)) applied++;
    }
    const fresh = await getDocsFromServer(collection(db, 'reservas'));
    const byId = new Map(fresh.docs.map(document => [document.id, document.data()]));
    for (const group of groups) for (const row of group.reservations) {
      const current = byId.get(row.id);
      for (const [key, value] of Object.entries(groupingPatch(group, row))) {
        if (current?.[key] !== value) throw new Error(`No se pudo verificar la agrupación de ${row.id}.`);
      }
      const changedFields = new Set([...Object.keys(groupingPatch(group, row)), 'version', 'updatedAt', 'editadoPor', 'fechaEdicion']);
      for (const [key, value] of Object.entries(row)) {
        if (!changedFields.has(key) && groupingRevision(value) !== groupingRevision(current?.[key])) {
          throw new Error(`El dato ${key} de ${row.id} cambió durante la verificación. Revisa la copia previa.`);
        }
      }
    }
    console.log(JSON.stringify({ appliedGroups: applied, verifiedSessions: groups.reduce((total, group) => total + group.reservations.length, 0) }));
  }
} finally { await terminate(db); }
