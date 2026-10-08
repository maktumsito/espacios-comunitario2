// @vitest-environment jsdom
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, collection, getDocs, getFirestore, terminate } from 'firebase/firestore';
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
const fault = vi.hoisted(() => ({ db: null as any, interrupt: true }));
vi.mock('../../src/firebase/config', () => ({ getDb: () => fault.db }));
vi.mock('../../src/services/reservationService', async original => {
  const service = await original<any>();
  return { ...service, saveReservationsBatch: (rows: any[], options: any = {}) => service.saveReservationsBatch(rows, {
    ...options, onProgress: (result: any) => { options.onProgress?.(result); if (fault.interrupt && result.pendingIds.length) throw new Error('Audit injected interruption'); },
  }) };
});
describe.skipIf(process.env.AUDIT_EMULATOR !== 'true' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8087')('actual CRUD recovery audit contract', () => {
  it('REC-01 writes the import audit entry when the partially saved import is resumed', async () => {
    const app = initializeApp({ projectId: 'demo-espacios', apiKey: 'local-only' }, 'audit-recovery');
    fault.db = getFirestore(app); connectFirestoreEmulator(fault.db, '127.0.0.1', 8087);
    await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents', { method: 'DELETE' });
    localStorage.clear();
    const auth = await import('../../src/services/authService');
    const user: any = { username: 'audit-a', name: 'audit-a', role: 'Administrador', canCreateReservations: true, canEditReservations: true, canDeleteReservations: true };
    auth.saveAuthUser(user);
    const { useReservationCrud } = await import('../../src/hooks/useReservationCrud');
    const service = await import('../../src/services/reservationService');
    const noop = () => {};
    const props: any = { reservations: [], currentUser: user, selectedReservation: null, setReservations: noop, triggerSyncToast: noop, setIsReservationModalOpen: noop, setEditingReservation: noop, setSelectedReservation: noop, setIsDetailModalOpen: noop, setIsDeleteModalOpen: noop, setDeleteTargetReservation: noop, setConflictReportData: noop, setIsDuplicating: noop, setPrefillDate: noop, setPrefillSpace: noop, setPrefillStartTime: noop, setPrefillEndTime: noop, requireAuth: (fn: any) => fn() };
    const hook = renderHook(() => useReservationCrud(props));
    try {
      const rows = Array.from({ length: 500 }, (_, i) => ({ id: `recovery-${i}`, fecha: '2026-11-10', horaInicio: '10:00', horaFin: '11:00', espacio: `SYNTHETIC ${i}`, responsable: 'Synthetic', tipoActividad: 'Taller', descripcion: 'Synthetic import recovery', actividadRecurrente: 'No' as const, estado: 'activa' as const, version: 0 }));
      await act(async () => { await expect(hook.result.current.handleImportReservations(rows)).rejects.toThrow('Audit injected interruption'); });
      const pending = await service.readPendingOperations(); expect(pending).toHaveLength(1); expect(pending[0].confirmedIds.length).toBeGreaterThan(0);
      fault.interrupt = false; await service.resumeReservationOperation(pending[0].id);
      expect((await getDocs(collection(fault.db, 'reservas'))).size).toBe(500);
      expect(await service.readPendingOperations()).toHaveLength(0);
      const logs = (await getDocs(collection(fault.db, 'audit_logs'))).docs.map(d => d.data());
      console.log('REC-01', JSON.stringify({ confirmedReservations: 500, auditEntries: logs.length, pendingOperations: 0 }));
      expect(logs.some(log => log.action === 'BULK_IMPORT')).toBe(true);
    } finally { cleanup(); await terminate(fault.db); await deleteApp(app); }
  }, 60000);
});
