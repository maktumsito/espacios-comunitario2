import { useEffect, useRef, useState } from 'react';
import type { DistributionProposal, DistributionRequest, DistributionResult, DistributionSnapshot, Reservation } from '../types';
import { getChileLocalDateString } from '../utils/dateUtils';
import { MAX_DISTRIBUTION_ACTIVITIES, analyzeRoomDistribution, buildVacateSpacesPlan, newDistributionRequest, type VacateSpacesOptions } from '../utils/roomDistribution';
import { commitDistribution, loadDistributionSnapshot, validateDistributionProposals } from '../services/distributionService';
import { ReservationWriteError } from '../services/reservationWriter';
import { isCoordinatorOrAdmin, userCanCreateReservations, userCanEditReservations, type AuthUser } from '../services/authService';
import { isReservationActiveForAvailability } from '../utils/conflictDetector';

interface PendingDistribution { operationId: string; fecha: string; proposals: DistributionProposal[]; expectedVersions: Record<string, number>; activateSpaceIds?: string[] }
interface Draft { fecha: string; requests: DistributionRequest[]; pending: PendingDistribution | null }
function readDraft(key: string): Draft {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    if (draft && Array.isArray(draft.requests) && draft.requests.length <= MAX_DISTRIBUTION_ACTIVITIES && /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha) && (draft.fecha >= getChileLocalDateString() || draft.pending)) return draft;
  } catch { /* Storage can be disabled; the in-memory draft remains usable. */ }
  return { fecha: getChileLocalDateString(), requests: [], pending: null };
}

export function useDistributionPlanner(user: AuthUser, onCommitted: (rows: Reservation[]) => void) {
  const key = `ccd_distribution_v1_${user.username}`;
  const [initial] = useState(() => readDraft(key));
  const [fecha, setFecha] = useState(initial.fecha);
  const [requests, setRequests] = useState<DistributionRequest[]>(initial.requests);
  const [pending, setPending] = useState<PendingDistribution | null>(initial.pending);
  const [snapshot, setSnapshot] = useState<DistributionSnapshot | null>(null);
  const [result, setResult] = useState<DistributionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const sequence = useRef(0);
  const canCreate = userCanCreateReservations(user), canEdit = userCanEditReservations(user);
  const needsActivation = Boolean(pending?.activateSpaceIds?.length || result?.activationRecommendations?.length);
  const canActivate = isCoordinatorOrAdmin(user);
  const canApply = requests.every(r => r.source ? canEdit : canCreate) && (!needsActivation || canActivate);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ fecha, requests, pending })); setStorageWarning(''); }
    catch { setStorageWarning('El navegador no pudo guardar el borrador. Mantén esta ventana abierta para conservarlo.'); }
  }, [key, fecha, requests, pending]);

  useEffect(() => {
    const controller = new AbortController();
    const run = ++sequence.current;
    setLoading(true); setSnapshot(null); setResult(null);
    loadDistributionSnapshot(fecha, controller.signal).then(data => {
      if (sequence.current === run) { setSnapshot(data); setError(''); }
    }).catch(error => {
      if (!controller.signal.aborted && sequence.current === run) setError(error.message);
    }).finally(() => { if (sequence.current === run) setLoading(false); });
    return () => { controller.abort(); sequence.current++; };
  }, [fecha]);

  const updateRequests = (next: DistributionRequest[]) => {
    if (busy || pending) return;
    setRequests(next); setResult(null); setError(''); setSuccess('');
  };
  const changeDate = (date: string) => {
    if (busy || pending || !date) return;
    setRequests(rows => rows.filter(r => !r.source)); setFecha(date); setResult(null); setError(''); setSuccess('');
  };
  async function calculate() {
    if (busy || pending) return;
    setBusy(true); setError(''); setResult(null); setSuccess('');
    try {
      const fresh = await loadDistributionSnapshot(fecha);
      setSnapshot(fresh);
      const refreshed = requests.map(request => {
        if (!request.source) return request;
        const source = fresh.reservations.find(row => row.id === request.source!.id);
        if (!source || !isReservationActiveForAvailability(source, new Set())) throw new Error(`La reserva «${request.descripcion}» ya no está activa. Retírala del plan.`);
        return { ...request, source };
      });
      setRequests(refreshed);
      // Allow the loading state to paint before the bounded synchronous calculation.
      await new Promise(resolve => setTimeout(resolve, 0));
      setResult(analyzeRoomDistribution(refreshed, fresh));
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function vacateSpaces(options: VacateSpacesOptions) {
    if (busy || pending) return;
    if (!options.spacesToVacate.length) {
      setError('Selecciona al menos una sala que necesites desocupar.');
      return;
    }
    setBusy(true); setError(''); setResult(null); setSuccess('');
    try {
      const fresh = await loadDistributionSnapshot(fecha);
      setSnapshot(fresh);
      await new Promise(resolve => setTimeout(resolve, 0));
      const plan = buildVacateSpacesPlan(fresh, options);
      if (!plan.requests.length) {
        setRequests([]);
        setSuccess(`Las salas seleccionadas (${options.spacesToVacate.join(', ')}) ya están libres entre ${options.startTime} y ${options.endTime}.`);
        return;
      }
      setRequests(plan.requests);
      setResult(plan.result);
      if (plan.result.unresolved.length === 0) {
        const cascadeNote = plan.cascadeCount > 0 ? ` (incluyendo ${plan.cascadeCount} reacomodo${plan.cascadeCount === 1 ? '' : 's'} en cadena)` : '';
        setSuccess(`Se calcularon automáticamente los nuevos espacios para liberar ${options.spacesToVacate.join(', ')}${cascadeNote}. Revisa la tabla y confirma con «Aplicar todo el plan».`);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function apply(approveActivation = false) {
    if (busy || !canApply || (!pending && (!result || result.unresolved.length || !result.proposals.length))) return;
    if (!pending && needsActivation && approveActivation !== true) {
      setError('Confirma la activación de los espacios recomendados antes de aplicar el plan.'); return;
    }
    setBusy(true); setError('');
    let operation = pending;
    try {
      if (!operation) {
        validateDistributionProposals(result!.proposals);
        operation = { operationId: crypto.randomUUID(), fecha, proposals: result!.proposals,
          expectedVersions: Object.fromEntries(requests.map(r => [r.source?.id || r.id, r.source ? r.source.version || 0 : -1])),
          ...(result!.activationRecommendations?.length ? { activateSpaceIds: result!.activationRecommendations.map(space => space.spaceId) } : {}) };
        // Persist the immutable payload before contacting the server. The reservation
        // operation journal also protects retries when this small draft cannot persist.
        setPending(operation);
        try { localStorage.setItem(key, JSON.stringify({ fecha, requests, pending: operation })); } catch { /* Journal handles recovery. */ }
      }
      const receipt = await commitDistribution(operation.fecha, operation.proposals, operation.expectedVersions, operation.operationId, operation.activateSpaceIds || []);
      if (receipt.pendingIds.length) throw new Error('La confirmación sigue pendiente. Reintenta sin modificar la propuesta.');
      setPending(null); setResult(null); setRequests([]);
      setSuccess(`Distribución confirmada: ${receipt.confirmedIds.length} actividades guardadas. Los demás equipos recibirán la actualización.`);
      onCommitted(receipt.reservations);
      loadDistributionSnapshot(fecha).then(setSnapshot).catch(() => setSnapshot(null));
    } catch (error) {
      if (!operation || error instanceof ReservationWriteError && error.discardPending) { setPending(null); setResult(null); }
      setError((error as Error).message);
    } finally { setBusy(false); }
  }
  const addNew = () => { if (canCreate && requests.length < MAX_DISTRIBUTION_ACTIVITIES) updateRequests([...requests, newDistributionRequest(`DIST_${crypto.randomUUID()}`)]); };
  const addExisting = (id: string) => {
    const source = snapshot?.reservations.find(row => row.id === id);
    if (source && canEdit && requests.length < MAX_DISTRIBUTION_ACTIVITIES && !requests.some(r => r.source?.id === id)) updateRequests([...requests, newDistributionRequest(id, source)]);
  };
  const addAllExisting = (rows: Reservation[]) => {
    if (!canEdit || requests.length >= MAX_DISTRIBUTION_ACTIVITIES) return;
    const availableSlots = MAX_DISTRIBUTION_ACTIVITIES - requests.length;
    const toAdd = rows
      .filter(row => !requests.some(r => r.source?.id === row.id))
      .slice(0, availableSlots)
      .map(row => newDistributionRequest(row.id, row));
    if (toAdd.length) updateRequests([...requests, ...toAdd]);
  };
  const duplicateRequest = (id: string) => {
    if (!canCreate || requests.length >= MAX_DISTRIBUTION_ACTIVITIES) return;
    const target = requests.find(r => r.id === id);
    if (!target) return;
    const copy: DistributionRequest = {
      ...target,
      id: `DIST_${crypto.randomUUID()}`,
      source: undefined,
      allowedSpaces: [...target.allowedSpaces],
      prioritySpaces: target.prioritySpaces ? [...target.prioritySpaces] : [],
      equipment: target.equipment.map(item => ({ ...item })),
    };
    updateRequests([...requests, copy]);
  };
  const clearDraft = () => {
    if (busy || pending) return;
    updateRequests([]);
  };
  return { fecha, requests, snapshot, result, pending, busy, loading, error, success, storageWarning, canCreate, canEdit, canApply, canActivate, needsActivation,
    changeDate, updateRequests, calculate, vacateSpaces, apply, addNew, addExisting, addAllExisting, duplicateRequest, clearDraft };
}
