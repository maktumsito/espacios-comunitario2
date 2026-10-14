import React, { useState, useEffect, useRef } from 'react';
import { AuthUser, LoginAccount, authenticateUser } from '../services/authService';
import { useLoginAccounts } from '../hooks/useLoginAccounts';
import { LoginAccountSelector } from './common/LoginAccountSelector';
import { BaseModal } from './common/BaseModal';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  X,
  ShieldCheck,
} from 'lucide-react';

interface PasswordPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
  actionDescription?: string;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionDescription = 'editar o crear reservas'
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<LoginAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pendingRef = useRef(false);
  const accounts = useLoginAccounts(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassword('');
    setSelectedAccount(null);
    setShowPassword(false);
    setErrorMessage('');
  }, [isOpen]);

  useEffect(() => {
    if (!accounts.loading && selectedAccount && !accounts.users.some(user => user.username === selectedAccount.username)) {
      setSelectedAccount(null);
      setPassword('');
    }
  }, [accounts.loading, accounts.users, selectedAccount]);

  useEffect(() => { if (selectedAccount) inputRef.current?.focus(); }, [selectedAccount]);

  if (!isOpen) return null;

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    setErrorMessage('');
  };

  const handleSelectUser = (usr: LoginAccount) => {
    if (pendingRef.current) return;
    setSelectedAccount(usr);
    setPassword('');
    setShowPassword(false);
    setErrorMessage('');
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return;
    setErrorMessage('');

    if (!selectedAccount || accounts.loading) {
      setErrorMessage('Seleccione su usuario antes de ingresar la clave.');
      return;
    }

    const cleanPass = password.trim();
    if (!cleanPass) {
      setErrorMessage('Por favor ingrese su clave de acceso.');
      return;
    }

    pendingRef.current = true;
    setIsLoading(true);
    try {
      const result = await authenticateUser(selectedAccount.username, cleanPass);
      if (result.success && result.user) {
        onSuccess(result.user);
        setPassword('');
        setSelectedAccount(null);
      } else {
        setErrorMessage(result.error || 'Clave de acceso no reconocida. Intente nuevamente.');
      }
    } catch {
      setErrorMessage('Error al comprobar clave. Intente nuevamente.');
    } finally {
      pendingRef.current = false;
      setIsLoading(false);
    }
  };

  const close = () => { if (!pendingRef.current) onClose(); };

  const headerElement = (
    <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/90 flex items-center justify-center text-white shadow-xs">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-base text-white">
            Clave de Edición Requerida
          </h3>
          <p className="text-xs text-slate-300">
            Para {actionDescription}
          </p>
        </div>
      </div>
      <button
        onClick={close}
        disabled={isLoading}
        className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center justify-center"
        aria-label="Cerrar modal de autenticación"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={close}
      maxWidth="md"
      layer="nested"
      customHeader={headerElement}
      containerClassName="rounded-2xl border border-slate-200 overflow-hidden text-slate-800"
      bodyClassName="p-6"
    >
      <div className="mb-4 p-3 rounded-xl bg-blue-50/80 border border-blue-200/80 text-blue-900 text-xs leading-relaxed flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          Selecciona tu usuario e ingresa tu contraseña personal para habilitar la edición.
        </span>
      </div>

      {errorMessage && (
        <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <LoginAccountSelector users={accounts.users} loading={accounts.loading} error={accounts.error}
        onRetry={accounts.retry} selectedUsername={selectedAccount?.username} onSelect={handleSelectUser} disabled={isLoading} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="input-password-prompt" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              {selectedAccount ? `2. Clave de ${selectedAccount.name.split(' ')[0]}` : '2. Clave de Acceso'}
            </label>
          </div>

          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <input
              ref={inputRef}
              id="input-password-prompt"
              type={showPassword ? 'text' : 'password'}
              value={password}
              required
              disabled={!selectedAccount || accounts.loading || isLoading}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder={selectedAccount ? `Clave de ${selectedAccount.name.split(' ')[0]}...` : 'Seleccione un usuario arriba primero...'}
              className="w-full pl-10 pr-12 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-60"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="min-h-[44px] min-w-[44px] absolute inset-y-0 right-0 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
              title={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
              aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={close}
            disabled={isLoading}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            id="btn-confirm-password"
            type="submit"
            disabled={!selectedAccount || accounts.loading || !password.trim() || isLoading}
            className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{isLoading ? 'Validando clave...' : 'Habilitar Edición'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

    </BaseModal>
  );
};
