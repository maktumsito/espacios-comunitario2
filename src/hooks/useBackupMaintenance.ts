import { useEffect, useState } from 'react';
import { checkAndRunScheduledBackup, type DatabaseBackupRecord } from '../services/backupService';
import { purgeExpiredScheduleSlots } from '../services/reservationService';

export function useBackupMaintenance(enabled: boolean) {
  const [backup, setBackup] = useState<DatabaseBackupRecord | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let dismiss: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const result = await checkAndRunScheduledBackup();
        if (!active || !result.triggered || !result.backup) return;
        setBackup(result.backup);
        clearTimeout(dismiss);
        dismiss = setTimeout(() => setBackup(null), 9000);
      } catch (error) {
        console.warn('No se pudo comprobar el respaldo programado:', error);
      }
    };
    void check();
    void purgeExpiredScheduleSlots(30).catch(error => console.warn('No se pudieron depurar los índices vencidos:', error));
    const interval = setInterval(check, 4 * 60 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(dismiss);
    };
  }, [enabled]);
  return { backup, dismissBackup: () => setBackup(null) };
}
