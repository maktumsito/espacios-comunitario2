import React, { useState, useEffect, useRef } from 'react';
import { AuthUser, UserAccount, getAllAuthorizedUsers, authenticateUser, subscribeToUsers } from '../services/authService';
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
  CheckCircle2,
  Check
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [recognizedUser, setRecognizedUser] = useState<AuthUser | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [usersList, setUsersList] = useState<UserAccount[]>(() => getAllAuthorizedUsers());
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen in real-time to users synced from Firestore
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeToUsers((updatedUsers) => {
      setUsersList(updatedUsers);
    });
    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    setErrorMessage('');
    const user = null;
    setRecognizedUser(user);
  };

  const handleSelectUser = (usr: UserAccount) => {
    setSelectedAccount(usr);
    setErrorMessage('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanPass = password.trim();
    if (!cleanPass) {
      setErrorMessage('Por favor ingrese su clave de acceso.');
      return;
    }

    try {
      const user = (await authenticateUser(selectedAccount?.username || username,cleanPass)).user;
      if (user) {
        onSuccess(user);
        setPassword('');
        setRecognizedUser(null);
        setSelectedAccount(null);
      } else {
        setErrorMessage('Clave de acceso no reconocida. Intente nuevamente.');
      }
    } catch {
      setErrorMessage('Error al comprobar clave. Intente nuevamente.');
    }
  };

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
        onClick={onClose}
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
      onClose={onClose}
      maxWidth="md"
      layer="nested"
      customHeader={headerElement}
      containerClassName="rounded-2xl border border-slate-200 overflow-hidden text-slate-800"
      bodyClassName="p-6"
    >
      <div className="mb-4 p-3 rounded-xl bg-blue-50/80 border border-blue-200/80 text-blue-900 text-xs leading-relaxed flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          Para garantizar la trazabilidad de los cambios, cada usuario debe ingresar su contraseña personal.
        </span>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4"><label className="block text-sm">Usuario<input aria-label="Usuario" autoComplete="username" value={selectedAccount?.username || username} onChange={e=>{setUsername(e.target.value);setSelectedAccount(null);}} className="w-full border rounded-lg p-2" required/></label>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              {selectedAccount ? `Clave de ${selectedAccount.name.split(' ')[0]}` : 'Ingrese su Clave de Acceso'}
            </label>
            {recognizedUser && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {recognizedUser.name}
              </span>
            )}
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
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder={selectedAccount ? `Clave de ${selectedAccount.name.split(' ')[0]}...` : 'Ingrese clave...'}
              className={`w-full pl-10 pr-12 py-2.5 bg-slate-50 border rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition ${
                recognizedUser ? 'border-emerald-500 ring-1 ring-emerald-500/20 bg-emerald-50/20' : 'border-slate-300'
              }`}
              autoFocus
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
            onClick={onClose}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            id="btn-confirm-password"
            type="submit"
            disabled={!password.trim()}
            className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Habilitar Edición</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* Authorized users list */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
          Haz clic para seleccionar tu usuario
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {usersList.map((usr) => {
            const isSelected = selectedAccount?.username === usr.username;
            return (
              <button
                key={usr.username}
                type="button"
                onClick={() => handleSelectUser(usr)}
                className={`min-h-[56px] p-2 rounded-xl border text-center transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-400/30 shadow-xs'
                    : 'border-slate-200/80 bg-slate-50 hover:bg-white hover:border-slate-300'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[8px]">
                    <Check className="w-2 h-2" />
                  </span>
                )}
                <div
                  className={`w-6 h-6 mx-auto rounded-full ${usr.avatarColor} text-white text-[10px] font-bold flex items-center justify-center shadow-xs mb-1 group-hover:scale-105 transition-transform`}
                >
                  {usr.initials}
                </div>
                <div className="text-[10.5px] font-bold text-slate-800 truncate">
                  {usr.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </BaseModal>
  );
};
