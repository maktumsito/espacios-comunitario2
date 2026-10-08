import React, { useState, useEffect } from 'react';
import { AuthUser, changeUserPassword, isMasterAdmin } from '../services/authService';
import { BaseModal } from './common/BaseModal';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  Check,
  Sparkles
} from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: AuthUser | null;
  currentUser?: AuthUser | null;
  onPasswordChanged?: (updatedUser?: AuthUser) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  onPasswordChanged
}) => {
  const activeUser = targetUser || currentUser;
  const isSelf = !targetUser || (currentUser && targetUser.username.toLowerCase() === currentUser.username.toLowerCase());
  const isMaster = isMasterAdmin(currentUser);
  const skipCurrentPassword = !isSelf && isMaster;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setErrorMsg('');
      setSuccessMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, targetUser]);

  if (!isOpen || !activeUser) return null;

  const isPasswordMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const hasMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isFormValid =
    (skipCurrentPassword || currentPassword.trim().length > 0) &&
    newPassword.trim().length >= 3 &&
    isPasswordMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!skipCurrentPassword && !currentPassword.trim()) {
      setErrorMsg('Debes ingresar tu clave actual para continuar.');
      return;
    }

    if (newPassword.trim().length < 8) {
      setErrorMsg('La nueva clave de acceso debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las nuevas claves ingresadas no coinciden. Por favor verifícalas.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await changeUserPassword(
        activeUser.username,
        currentPassword,
        newPassword,
        skipCurrentPassword
      );

      if (res.success) {
        setSuccessMsg(res.message);
        if (onPasswordChanged) {
          onPasswordChanged(res.user);
        }
        setTimeout(() => {
          onClose();
        }, 1600);
      } else {
        setErrorMsg(res.message || 'Error al actualizar la clave de acceso.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ocurrió un problema inesperado al cambiar la clave.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerElement = (
    <div>
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white p-5 sm:p-6 flex items-start justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
            <KeyRound className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h3 className="font-extrabold text-base sm:text-lg tracking-tight flex items-center gap-1.5">
              <span>{isSelf ? 'Cambiar mi Clave de Acceso' : 'Restablecer Clave de Usuario'}</span>
            </h3>
            <p className="text-xs text-blue-100/90 font-medium mt-0.5">
              Seguridad y autenticación de cuentas
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/15 transition cursor-pointer flex items-center justify-center"
          title="Cerrar ventana"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* User Badge Info */}
      <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className={`w-9 h-9 rounded-xl ${activeUser.avatarColor || 'bg-blue-600'} text-white font-black text-xs flex items-center justify-center shadow-xs ring-2 ring-white`}
          >
            {activeUser.initials}
          </div>
          <div>
            <div className="font-bold text-xs text-slate-900 leading-tight flex items-center gap-1.5">
              <span>{activeUser.name}</span>
              {isMasterAdmin(activeUser) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md border border-amber-300/80 flex items-center gap-0.5">
                  👑 Master Admin
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
              @{activeUser.username} • <span className="font-sans font-medium text-slate-600">{activeUser.role}</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Activa
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      layer="nested"
      customHeader={headerElement}
      containerClassName="rounded-3xl border border-slate-200 overflow-hidden text-slate-800"
      bodyClassName="p-0 overflow-hidden"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
        {/* Alerts */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center space-x-2.5 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs font-bold leading-relaxed">
                {successMsg}
              </div>
            </div>
          )}

          {/* Field 1: Clave Actual (Shown if self or not master override) */}
          {!skipCurrentPassword && (
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center justify-between">
                <span>Clave Actual *</span>
                <span className="text-[10px] text-slate-400 font-normal">Para confirmar identidad</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  placeholder="Ingresa tu clave actual"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showCurrentPassword ? 'Ocultar clave' : 'Mostrar clave'}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {skipCurrentPassword && (
            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-[11px] flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Privilegio de Super Admin: Puedes asignar una nueva clave directamente a este usuario sin requerir la anterior.</span>
            </div>
          )}

          {/* Field 2: Nueva Clave */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>Nueva Clave de Acceso *</span>
              <span className="text-[10px] text-slate-400 font-normal">Mínimo 8 caracteres</span>
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                placeholder="Nueva clave deseada"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-xs"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                title={showNewPassword ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Field 3: Confirmar Nueva Clave */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
                <span>Confirmar Nueva Clave *</span>
                {isPasswordMatch && (
                  <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Coinciden
                  </span>
                )}
              </label>
              {hasMismatch && (
                <span className="text-rose-600 font-semibold text-[10px]">
                  No coinciden
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                placeholder="Vuelve a escribir la nueva clave"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full pl-3.5 pr-10 py-2.5 bg-white border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 font-medium shadow-xs ${
                  hasMismatch
                    ? 'border-rose-400 bg-rose-50/20 focus:ring-rose-400'
                    : isPasswordMatch
                    ? 'border-emerald-400 focus:ring-emerald-500'
                    : 'border-slate-200 focus:ring-blue-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                title={showConfirmPassword ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end space-x-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`min-h-[44px] flex items-center space-x-2 px-5 py-2.5 rounded-xl text-white font-extrabold shadow-md transition cursor-pointer ${
                isFormValid && !isSubmitting
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20 active:scale-95'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Guardando...' : 'Guardar Nueva Clave'}</span>
            </button>
          </div>
        </form>
    </BaseModal>
  );
};
