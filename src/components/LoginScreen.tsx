import React, { useState, useEffect, useRef } from 'react';
import {
  AuthUser,
  LoginAccount,
  authenticateUser,
  authenticateGoogleSession,
  getLockoutStatus
} from '../services/authService';
import { auth } from '../firebase/config';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { useLoginAccounts } from '../hooks/useLoginAccounts';
import { LoginAccountSelector } from './common/LoginAccountSelector';
import {
  Lock,
  Eye,
  EyeOff,
  Building2,
  ArrowRight,
  AlertCircle,
  KeyRound,
  ShieldAlert,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
  sessionExpired?: boolean;
  sessionChanged?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, sessionExpired = false, sessionChanged = false }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<LoginAccount | null>(null);
  const accounts = useLoginAccounts();
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accounts.loading && selectedAccount && !accounts.users.some(user => user.username === selectedAccount.username)) {
      setSelectedAccount(null);
      setPassword('');
    }
  }, [accounts.loading, accounts.users, selectedAccount]);

  useEffect(() => {
    if (selectedAccount && !lockoutSeconds) passwordInputRef.current?.focus();
  }, [selectedAccount, lockoutSeconds]);

  // Check lockout status for the selected user (or globally)
  useEffect(() => {
    const status = getLockoutStatus(selectedAccount?.username);
    if (status.isLocked) {
      setLockoutSeconds(status.remainingSeconds);
    } else {
      setLockoutSeconds(0);
    }
  }, [selectedAccount]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSelectUser = (usr: LoginAccount) => {
    if (isLoading) return;
    setSelectedAccount(usr);
    setPassword('');
    setShowPassword(false);
    setErrorMessage('');
    passwordInputRef.current?.focus();
    const status = getLockoutStatus(usr.username);
    if (status.isLocked) {
      setLockoutSeconds(status.remainingSeconds);
    } else {
      setLockoutSeconds(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMessage('');

    if (!selectedAccount || accounts.loading) {
      setErrorMessage('Por favor seleccione su usuario de la lista a continuación para iniciar sesión.');
      return;
    }

    const cleanPass = password.trim();
    if (!cleanPass) {
      setErrorMessage('Debe ingresar su contraseña personal para acceder al sistema.');
      return;
    }

    if (lockoutSeconds > 0) {
      setErrorMessage(`Acceso bloqueado. Espere ${lockoutSeconds} segundos antes de reintentar.`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await authenticateUser(selectedAccount.username, cleanPass);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        if (res.remainingSeconds && res.remainingSeconds > 0) {
          setLockoutSeconds(res.remainingSeconds);
        }
        setErrorMessage(res.error || 'Clave de acceso incorrecta. Verifique su clave e intente nuevamente.');
        setIsLoading(false);
      }
    } catch {
      setErrorMessage('Error de conexión al verificar credenciales. Intente nuevamente.');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!selectedAccount || isLoading || accounts.loading) return;
    setErrorMessage('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const matchedUser = result.user.emailVerified ? selectedAccount : null;
      if (!matchedUser) {
        await signOut(auth);
        setErrorMessage('Esta cuenta de Google no tiene acceso asignado. Seleccione su usuario e ingrese su clave.');
        return;
      }
      onLoginSuccess(await authenticateGoogleSession(matchedUser.username, await result.user.getIdToken()));
    } catch (err: any) {
      console.warn('Google sign-in status:', err?.message || err);
      setErrorMessage('No se completó el inicio con Google. Seleccione su usuario e ingrese su clave asignada.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-md">
        {/* App Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-500/25 mb-4 ring-4 ring-blue-500/20">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Gestión de Espacios
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Sistema de Reserva de Salas, Talleres y Cronogramas
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 p-6 sm:p-8 text-slate-800">
          {(sessionExpired || sessionChanged) && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {sessionChanged
              ? 'La sesión cambió o se cerró en otra pestaña. Selecciona tu usuario e ingresa nuevamente para continuar.'
              : 'Tu sesión venció. Selecciona tu usuario e ingresa nuevamente para continuar.'}
          </p>}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4.5 h-4.5 text-blue-600" />
                Acceso Autenticado
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedAccount ? (
                  <span>Iniciando sesión como <strong className="text-blue-700">{selectedAccount.name}</strong></span>
                ) : (
                  <span className="text-amber-700 font-medium">Seleccione su usuario a continuación</span>
                )}
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Seguro
            </span>
          </div>

          <LoginAccountSelector users={accounts.users} loading={accounts.loading} error={accounts.error}
            onRetry={accounts.retry} selectedUsername={selectedAccount?.username} onSelect={handleSelectUser} disabled={isLoading} />

          {errorMessage && (
            <div role="alert" className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-700 text-xs font-semibold animate-fadeIn">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <div className="leading-snug">{errorMessage}</div>
            </div>
          )}

          {lockoutSeconds > 0 && (
            <div className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center gap-2.5 text-amber-800 text-xs font-bold animate-fadeIn">
              <Clock className="w-4.5 h-4.5 text-amber-600 shrink-0 animate-pulse" />
              <div className="leading-snug">
                Protección contra fuerza bruta activa: intente de nuevo en <span className="text-amber-950 underline">{lockoutSeconds} segundos</span>.
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Clave */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Contraseña de Acceso {selectedAccount ? `(${selectedAccount.name.split(' ')[0]})` : ''} *
              </label>

              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4.5 h-4.5" />
                </div>
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  disabled={!selectedAccount || accounts.loading || lockoutSeconds > 0 || isLoading}
                  required
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder={
                    lockoutSeconds > 0
                      ? `Bloqueado temporalmente (${lockoutSeconds}s)`
                      : selectedAccount
                      ? `Ingrese clave de ${selectedAccount.name.split(' ')[0]}...`
                      : 'Seleccione un usuario arriba primero...'
                  }
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 pt-1">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                Máximo 5 intentos antes del bloqueo preventivo de 60 segundos.
              </p>
            </div>

            {/* Submit Button */}
            <button
              id="btn-login-submit"
              type="submit"
              disabled={isLoading || accounts.loading || !password.trim() || !selectedAccount || lockoutSeconds > 0}
              className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span>Validando credenciales...</span>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Alternative Google Sign-In with Firebase Auth */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading || accounts.loading || !selectedAccount}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer hover:border-slate-400"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Acceso Administrador con Google Workspace</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} Sistema Comunitario de Gestión de Espacios</p>
          <a href="/privacidad.html" className="underline underline-offset-2">Política de privacidad</a>
        </div>
      </div>
    </div>
  );
};

