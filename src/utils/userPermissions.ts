import type { AuthUser } from '../services/authService';

export const reservationPermissionKeys = ['canCreateReservations', 'canEditReservations', 'canDeleteReservations'] as const;
export type ReservationPermission = typeof reservationPermissionKeys[number];

export function isReservationPermissionAdmin(user?: Partial<AuthUser> | null): boolean {
  return user?.isMasterAdmin === true && user.username?.trim().toLowerCase() === 'cristian shute';
}

export function reservationPermission(user: Partial<AuthUser> | null | undefined, key: ReservationPermission): boolean {
  if (!user) return false;
  if (typeof user[key] === 'boolean') return user[key];
  const role = (user.role || '').trim().toLowerCase();
  return ['administrador', 'coordinador'].includes(role) ||
    (key === 'canCreateReservations' && ['recepción', 'recepcion', 'gestión', 'gestion'].includes(role));
}

export function defaultNewUserPermissions(role: string) {
  return {
    canCreateReservations: reservationPermission({ role }, 'canCreateReservations'),
    canEditReservations: reservationPermission({ role }, 'canEditReservations'),
    canDeleteReservations: false,
  };
}
