import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Database } from 'lucide-react';

interface AppFooterProps {
  lastSyncTime: number | null;
  isSyncing?: boolean;
  isFirebaseConnected?: boolean;
  totalReservations?: number;
  onManualSync?: () => void;
}

export const AppFooter: React.FC<AppFooterProps> = ({
  lastSyncTime,
  isSyncing = false,
  isFirebaseConnected = false,
  totalReservations = 0,
  onManualSync
}) => {
  const formattedLastSync = useMemo(() => {
    if (!lastSyncTime) {
      return 'Pendiente de sincronización';
    }
    try {
      return format(new Date(lastSyncTime), 'dd/MM/yyyy HH:mm:ss');
    } catch {
      return 'No disponible';
    }
  }, [lastSyncTime]);

  return (
    <footer id="app-footer" className="no-print mt-auto border-t border-slate-200 bg-white px-3 py-4 text-sm text-slate-500 sm:px-6" role="contentinfo">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="lg:hidden">{isSyncing ? 'Sincronizando cambios' : isFirebaseConnected ? 'Conectado' : 'Sin conexión · datos locales'}</p>
          <p id="footer-last-sync-container">Última actualización: <span id="footer-last-sync-value" className="tabular-nums">{formattedLastSync}</span></p>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <a href="/privacidad.html" className="inline-flex min-h-11 items-center text-slate-600 underline underline-offset-2 hover:text-blue-700">Privacidad</a>
          <details className="max-w-full">
            <summary className="min-h-11 cursor-pointer py-2.5 text-slate-600">Detalles de sincronización</summary>
            <div className="space-y-3 py-2">
              <p className="flex items-center gap-2"><Database className="h-4 w-4" />{totalReservations} reservas cargadas</p>
              <p>{isSyncing ? 'Sincronizando cambios' : isFirebaseConnected ? 'Conectado a la nube' : 'Usando datos locales'}</p>
              {onManualSync && <button id="btn-footer-manual-sync" type="button" onClick={onManualSync} disabled={isSyncing} aria-label="Sincronizar ahora con la base de datos" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />Sincronizar ahora</button>}
            </div>
          </details>
        </div>
      </div>
    </footer>
  );
};
