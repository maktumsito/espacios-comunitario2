import React, { useState, useEffect, useRef } from 'react';
import {
  AuthUser,
  UserAccount,
  getAllAuthorizedUsers,
  authenticateUser,
  findAuthorizedGoogleAccount,
  authenticateGoogleSession,
  subscribeToUsers,
  getLockoutStatus
} from '../services/authService';
import { auth } from '../firebase/config';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  Lock,
  Eye,
  EyeOff,
  Building2,
  ArrowRight,
  AlertCircle,
  KeyRound,
  ShieldAlert,
  Users,
  Check,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [usersList, setUsersList] = useState<UserAccount[]>(() => getAllAuthorizedUsers());
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Listen in real-time to users synced from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToUsers((updatedUsers) => {
      setUsersList(updatedUsers);
    });
    return () => unsubscribe();
  }, []);

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

  const handleSelectUser = (usr: UserAccount) => {
    setSelectedAccount(usr);
    setPassword('');
    setErrorMessage('');
    const status = getLockoutStatus(usr.username);
    if (status.isLocked) {
      setLockoutSeconds(status.remainingSeconds);
    } else {
      setLockoutSeconds(0);
    }
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedAccount) {
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
      const res = await authenticateUser(selectedAccount.username, cleanPass, usersList);
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
    setErrorMessage('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const email = result.user?.email || '';

      const matchedUser = result.user.emailVerified ? findAuthorizedGoogleAccount(email, usersList) : null;
      if (!matchedUser) {
        await signOut(auth);
        setErrorMessage('Esta cuenta de Google no tiene acceso asignado. Ingrese con su usuario y contraseña.');
        return;
      }
      onLoginSuccess(await authenticateGoogleSession(matchedUser.username, await result.user.getIdToken()));
    } catch (err: any) {
      console.warn('Google sign-in status:', err?.message || err);
      setErrorMessage('No se completó el inicio con Google. Por favor ingrese con su usuario y contraseña asignada.');
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

          {/* Directory of authorized users - REQUIRED SELECTION */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                1. Seleccione su Usuario *
              </label>
              {selectedAccount && (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {selectedAccount.role}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {usersList.map((usr) => {
                const isSelected = selectedAccount?.username === usr.username;
                return (
                  <button
                    key={usr.username}
                    type="button"
                    onClick={() => handleSelectUser(usr)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer group relative ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/90 ring-2 ring-blue-500/30 shadow-xs'
                        : 'border-slate-200 bg-slate-50/80 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] shadow-xs">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                    <div
                      className={`w-7 h-7 mx-auto rounded-full ${usr.avatarColor} text-white text-xs font-bold flex items-center justify-center shadow-xs mb-1.5 group-hover:scale-105 transition-transform`}
                    >
                      {usr.initials}
                    </div>
                    <div className="text-[11px] font-bold text-slate-800 truncate">
                      {usr.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-700 text-xs font-semibold animate-fadeIn">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
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
                  disabled={lockoutSeconds > 0 || isLoading}
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
              disabled={isLoading || !password.trim() || !selectedAccount || lockoutSeconds > 0}
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
              disabled={isLoading}
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

