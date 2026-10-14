import { useEffect, useState } from 'react';
import { fetchLoginAccounts, type LoginAccount } from '../services/authService';

export function useLoginAccounts(enabled = true) {
  const [users, setUsers] = useState<LoginAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchLoginAccounts(controller.signal)
      .then(users => { if (!controller.signal.aborted) setUsers(users); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUsers([]);
          setError('No se pudo cargar la lista de usuarios. Intenta nuevamente.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, revision]);
  return { users, loading, error, retry: () => setRevision(value => value + 1) };
}
