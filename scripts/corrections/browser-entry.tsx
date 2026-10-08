// Diagnostic bridge: real application hooks and services, real browser storage.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as service from '../../src/services/reservationService';
import * as auth from '../../src/services/authService';
import * as logs from '../../src/services/auditLogService';
import * as backup from '../../src/services/backupService';
import * as journal from '../../src/services/reservationOperationJournal';
import * as writer from '../../src/services/reservationWriter';
import * as snapshots from '../../src/services/auditSnapshotService';
import * as replacement from '../../src/utils/reservationReplacement';
import * as firebase from '../../src/firebase/gateway';
import { getDb } from '../../src/firebase/config';
import { useReservationCrud } from '../../src/hooks/useReservationCrud';
import type { Reservation } from '../../src/types';
const bridge: any = { service, auth, logs, backup, journal, writer, snapshots, replacement, firebase, db: getDb(), events: [] };
(window as any).audit = bridge;
function Probe() {
  const [rows, setRows] = useState<Reservation[]>(service.getLocalCache());
  const [formOpen, setFormOpen] = useState(false);
  const noop = () => {};
  const driver = useReservationCrud({ reservations: rows, setReservations: setRows,
    currentUser: auth.getStoredAuthUser(), selectedReservation: null,
    triggerSyncToast: (message, type) => bridge.events.push({ message, type }),
    setIsReservationModalOpen: setFormOpen, setEditingReservation: noop, setSelectedReservation: noop,
    setIsDetailModalOpen: noop, setIsDeleteModalOpen: noop, setDeleteTargetReservation: noop,
    setConflictReportData: noop, setIsDuplicating: noop, setPrefillDate: noop, setPrefillSpace: noop,
    setPrefillStartTime: noop, setPrefillEndTime: noop, requireAuth: action => action(),
  });
  bridge.driver = driver; bridge.rows = rows; bridge.formOpen = formOpen;
  bridge.refresh = async () => { const data = await service.reloadAllFromFirestore(); setRows(data); return data; };
  bridge.openForm = () => setFormOpen(true);
  useEffect(() => service.subscribeToReservations(setRows, noop), []);
  return <aside id="audit-probe" style={{ position: 'fixed', bottom: 0, right: 0, background: '#fff', color: '#000', zIndex: 999999, maxHeight: 180, overflow: 'auto', padding: 8 }}>
    <strong>Diagnóstico local: {auth.getStoredAuthUser()?.username}</strong>
    <div data-audit-form={String(formOpen)}>Reservas observadas: {rows.length}</div>
    {rows.filter(r => r.id.startsWith('integrated')).map(r => <div key={r.id}>{r.id} | {r.fecha} | v{r.version} | {r.estado} | {r.descripcion}</div>)}
  </aside>;
}
const node = document.createElement('div'); document.body.appendChild(node); createRoot(node).render(<Probe />);
