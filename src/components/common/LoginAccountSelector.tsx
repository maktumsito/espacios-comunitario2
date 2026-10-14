import { Check } from 'lucide-react';
import type { LoginAccount } from '../../services/authService';

interface LoginAccountSelectorProps {
  users: readonly LoginAccount[];
  selectedUsername?: string;
  onSelect: (user: LoginAccount) => void;
  disabled?: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

export function LoginAccountSelector({ users, selectedUsername, onSelect, disabled, loading, error, onRetry }: LoginAccountSelectorProps) {
  return <div className="mb-5">
    <p className="mb-2.5 text-xs font-bold text-slate-700">1. Haz clic en tu usuario</p>
    {loading ? <p role="status" className="text-sm text-slate-500">Cargando usuarios...</p> : error ? <div>
      <p role="alert" className="text-sm text-rose-700">{error}</p>
      <button type="button" onClick={onRetry} disabled={disabled} className="min-h-[44px] text-sm font-semibold text-blue-700">Reintentar</button>
    </div> : !users.length ? <div>
      <p role="status" className="text-sm text-slate-500">No hay usuarios disponibles.</p>
      <button type="button" onClick={onRetry} disabled={disabled} className="min-h-[44px] text-sm font-semibold text-blue-700">Actualizar usuarios</button>
    </div> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Seleccionar usuario">
      {users.map(user => {
        const selected = selectedUsername === user.username;
        return <button key={user.username} type="button" onClick={() => onSelect(user)} disabled={disabled}
          aria-label={user.name} aria-pressed={selected}
          className={`min-h-[72px] p-2.5 rounded-xl border text-center transition cursor-pointer relative disabled:opacity-50 ${selected
            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/30'
            : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'}`}>
          {selected && <Check className="absolute top-1 right-1 w-4 h-4 text-blue-600" />}
          <span aria-hidden="true" className={`w-7 h-7 mx-auto rounded-full ${user.avatarColor || 'bg-blue-600'} text-white text-xs font-bold flex items-center justify-center mb-1.5`}>{user.initials}</span>
          <span className="block text-xs font-bold text-slate-800 break-words">{user.name}</span>
        </button>;
      })}
    </div>}
  </div>;
}
