import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../services/authService';
import { isCristianShute } from '../services/authService';
import { readSystemDiagnostics } from '../services/systemMaintenanceService';
import { getCleanableCacheEntries, purgeLocalStorageCache } from '../services/storageService';
import { fetchFullBackupRecord, setBackupProtection } from '../services/backupService';
import { validateBackupRecord } from '../utils/backupIntegrity';
import type { Reservation } from '../types';
import { DuplicateReview } from './maintenance/DuplicateReview';
import { ConfirmationModal } from './common/ConfirmationModal';

const date = (value?: string) => value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Sin registro';
const actionLabels: Record<string, string> = { backup_protected: 'Copia protegida', backup_unprotected: 'Protección retirada', backup_deleted: 'Copia eliminada' };
const buttonClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export function SystemMaintenanceView({ currentUser, reservations, lastSyncTime, onReviewReservation, onOpenBackups }: {
  currentUser?: AuthUser | null; reservations: Reservation[]; lastSyncTime?: number | null;
  onReviewReservation?: (reservation: Reservation) => void | Promise<void>; onOpenBackups?: () => void | Promise<void>;
}) {
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof readSystemDiagnostics>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmClean, setConfirmClean] = useState(false);
  const [unprotectId, setUnprotectId] = useState<string | null>(null);
  const locked = useRef(false);
  const revision = useRef(0);
  const owner = isCristianShute(currentUser);
  useEffect(() => {
    let active = true;
    setDiagnostics(null); setError(''); setMessage(''); setBusy(false); setConfirmClean(false); setUnprotectId(null);
    void readSystemDiagnostics().then(value => { if (active) setDiagnostics(value); })
      .catch(err => { if (active) setError(err?.message || 'No se pudo completar el diagnóstico.'); });
    return () => { active = false; revision.current++; };
  }, [currentUser?.username]);
  const perform = async (task: () => Promise<string>) => {
    if (locked.current) return new Error('Hay otra operación en curso. Espera su confirmación.');
    locked.current = true; setBusy(true); setError(''); setMessage('');
    const started = revision.current;
    try {
      const result = await task();
      const refreshed = await readSystemDiagnostics();
      if (started === revision.current) { setMessage(result); setDiagnostics(refreshed); }
    } catch (err: any) {
      const failure = new Error(err?.message || 'La operación no se completó. Puedes reintentar.');
      if (started === revision.current) setError(failure.message);
      return failure;
    }
    finally { locked.current = false; if (started === revision.current) setBusy(false); }
  };
  const remote = diagnostics?.remote;
  const cleanable = getCleanableCacheEntries();
  return <section className="space-y-6" aria-labelledby="system-health-title">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div><h2 id="system-health-title" className="text-lg font-semibold text-slate-900">Salud y mantención del sistema</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Revisa el estado, conserva tus respaldos y resuelve incidencias desde sus registros originales.</p></div>
      <button className={buttonClass} disabled={busy} onClick={() => perform(async () => 'Diagnóstico actualizado.')}>{busy ? 'Comprobando…' : 'Actualizar diagnóstico'}</button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {!diagnostics ? <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm">Comprobando conexión, respaldos y guardados pendientes…</p> :
      <dl className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0">
        {[
          ['Base de datos', remote ? `Verificada: ${date(remote.checkedAt)}` : diagnostics.remoteError],
          ['Última sincronización de la agenda', lastSyncTime ? date(new Date(lastSyncTime).toISOString()) : 'Todavía no confirmada'],
          ['Guardados pendientes en este navegador', diagnostics.pendingCount === null ? diagnostics.pendingError : String(diagnostics.pendingCount)],
          ['Almacenamiento local aproximado', `${diagnostics.storage.usedKb} KB; ${cleanable.length} cachés antiguas identificadas`],
        ].map(([title, value]) => <div key={title} className="p-5"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</dt><dd className="mt-2 text-sm text-slate-900">{value}</dd></div>)}
      </dl>}
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-900">Limpieza segura del navegador</h3>
      <p className="mt-2 text-sm text-slate-600">Retira únicamente cachés antiguas identificadas. Se conservan la sesión, los borradores, las importaciones, la auditoría y los datos de recuperación.</p>
      {cleanable.length > 0 && <ul className="my-3 text-xs text-slate-500">{cleanable.map(item => <li key={item.key}>{item.key}: {item.kb} KB</li>)}</ul>}
      <button className={`${buttonClass} mt-3`} disabled={!owner || busy || !remote || diagnostics?.pendingCount !== 0 || !cleanable.length} onClick={() => setConfirmClean(true)}>Revisar limpieza de caché</button>
      {diagnostics?.pendingCount !== 0 && <p className="mt-2 text-sm text-amber-800">La limpieza requiere comprobar y resolver los guardados pendientes.</p>}
      {!owner && <p className="mt-2 text-xs text-slate-500">La limpieza y la conservación de respaldos están a cargo de Cristian Shute.</p>}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Respaldos confirmados en el servidor</h3>
        {onOpenBackups && <button className={buttonClass} onClick={onOpenBackups}>Crear o recuperar un respaldo</button>}</div>
      <p className="mt-2 text-sm text-slate-600">La rotación conserva las cinco copias automáticas recientes. Las copias manuales y protegidas se conservan. Puedes verificar el contenido antes de necesitar una restauración.</p>
      {remote && !remote.backups.length && <p role="status" className="mt-4 text-sm text-amber-800">No hay copias confirmadas. Crea un respaldo antes de realizar cambios importantes.</p>}
      <div className="mt-4 divide-y divide-slate-200">{remote?.backups.map(backup => <div key={backup.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row">
        <div className="min-w-0"><p className="text-sm font-medium text-slate-800">{date(backup.timestamp)} · {backup.tipo === 'manual' ? 'Manual' : 'Automática'}</p>
          <p className="mt-1 text-xs text-slate-500">{backup.totalReservas} reservas · {backup.protected ? 'Protegida' : backup.tipo === 'manual' ? 'Conservada por ser manual' : 'Sujeta a rotación'}</p></div>
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} onClick={() => perform(async () => {
          const record = await fetchFullBackupRecord(backup.id); if (!record?.data) throw new Error('No se pudo obtener el contenido completo del respaldo.');
          await validateBackupRecord(record); return `Integridad verificada: ${backup.fecha}.`;
        })}>Verificar integridad</button>
          {owner && <button className={buttonClass} disabled={busy} onClick={() => backup.protected ? setUnprotectId(backup.id) : perform(async () => {
            await setBackupProtection(backup.id, !backup.protected); return backup.protected ? 'Protección retirada. La copia se conserva.' : 'Copia protegida contra rotación y eliminación.';
          })}>{backup.protected ? 'Retirar protección' : 'Proteger copia'}</button>}</div>
      </div>)}</div>
      {remote?.limited && <p className="mt-2 text-xs text-slate-500">Se muestran las 50 copias más recientes.</p>}
    </section>
    <DuplicateReview reservations={reservations} onReview={onReviewReservation} />
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-semibold text-slate-900">Índices de disponibilidad</h3>
      {remote && <p className="mt-2 text-sm text-slate-700">{remote.slotCleanup ? `${remote.slotCleanup.ok ? 'Última comprobación correcta' : 'Última comprobación fallida'}: ${date(remote.slotCleanup.checkedAt)} · ${remote.slotCleanup.purgedCount} índices vacíos retirados.` : 'Todavía no hay una comprobación registrada en esta instancia del servidor.'}</p>}
      <p className="mt-2 text-sm text-slate-600">El servidor comprueba periódicamente los índices antiguos y elimina únicamente los que están vacíos. Los índices ocupados y las reservas históricas se conservan. La reconstrucción requiere una intervención supervisada.</p></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-semibold text-slate-900">Últimas acciones de conservación</h3>
      {remote && !remote.logs.length && <p className="mt-2 text-sm text-slate-500">Todavía no hay acciones registradas.</p>}
      <ul className="mt-3 divide-y divide-slate-100 text-sm">{remote?.logs.map(log => <li key={log.id} className="py-2"><span className="font-medium">{actionLabels[log.action] || log.action}</span> · {date(log.timestamp)}<p className="break-all text-xs text-slate-500">{log.actor} · {log.backupId}</p></li>)}</ul></section>
    <ConfirmationModal isOpen={confirmClean} title="Limpiar cachés antiguas" message={`Se retirarán ${cleanable.length} cachés antiguas. Los guardados pendientes se comprobarán nuevamente antes de limpiar.`}
      confirmLabel="Limpiar cachés identificadas" onCancel={() => setConfirmClean(false)} isProcessing={busy} onConfirm={async () => {
        if (!owner) throw new Error('Solo Cristian Shute puede ejecutar la limpieza.');
        const failure = await perform(async () => { const result = await purgeLocalStorageCache(); setConfirmClean(false); return `Limpieza completada: ${Math.round(result.freedBytes / 1024)} KB liberados.`; });
        if (failure) throw failure;
      }} />
    <ConfirmationModal isOpen={!!unprotectId} title="Retirar protección del respaldo" message="La copia se conservará. Si es automática y queda fuera de las cinco más recientes, podrá eliminarse en una rotación posterior."
      confirmLabel="Retirar protección" onCancel={() => setUnprotectId(null)} isProcessing={busy} onConfirm={async () => {
        if (!owner || !unprotectId) throw new Error('Solo Cristian Shute puede cambiar la protección.');
        const failure = await perform(async () => { await setBackupProtection(unprotectId, false); setUnprotectId(null); return 'Protección retirada. La copia se conserva.'; });
        if (failure) throw failure;
      }} />
  </section>;
}
