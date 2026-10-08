import { describe, it, expect } from 'vitest';
import {
  isCristianShute,
  isMasterAdmin,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations,
  AuthUser
} from '../authService';

describe('Cristian Shute User Reservation Permissions Suite', () => {
  const cristianShuteUser: AuthUser = {
    username: 'cristian shute',
    name: 'Cristian Shute',
    role: 'Administrador',
    email: 'cristianshute@gmail.com',
    initials: 'CS',
    avatarColor: 'bg-blue-600',
    isMasterAdmin: true
  };

  const patricioFloresUser: AuthUser = {
    username: 'patricio flores',
    name: 'Patricio Flores',
    role: 'Administrador',
    initials: 'PF',
    avatarColor: 'bg-emerald-600',
    isMasterAdmin: true
  };

  const recepcionUser: AuthUser = {
    username: 'gonzalo carrasco',
    name: 'Gonzalo Carrasco',
    role: 'Recepción',
    initials: 'GC',
    avatarColor: 'bg-indigo-600'
  };

  const coordinacionUser: AuthUser = {
    username: 'carla.coordinadora',
    name: 'Carla Morales',
    role: 'Coordinador',
    initials: 'CM',
    avatarColor: 'bg-purple-600'
  };

  const auxiliarUser: AuthUser = {
    username: 'juan.auxiliar',
    name: 'Juan Pérez',
    role: 'Auxiliar',
    initials: 'JP',
    avatarColor: 'bg-amber-600'
  };

  describe('isCristianShute identification', () => {
    it('correctly identifies Cristian Shute by its registered master flag and username', () => {
      expect(isCristianShute(cristianShuteUser)).toBe(true);
      expect(isCristianShute({ ...cristianShuteUser, username: 'CRISTIAN SHUTE' })).toBe(true);
      expect(isCristianShute({ ...cristianShuteUser, username: 'legacy-alias' })).toBe(false);
      expect(isCristianShute({ ...cristianShuteUser, email: 'cristianshute@gmail.com' })).toBe(true);
    });

    it('rejects other users including other master admins', () => {
      expect(isCristianShute(patricioFloresUser)).toBe(false);
      expect(isCristianShute(recepcionUser)).toBe(false);
      expect(isCristianShute(coordinacionUser)).toBe(false);
      expect(isCristianShute(null)).toBe(false);
      expect(isCristianShute(undefined)).toBe(false);
    });
  });

  describe('userCanCreateReservations', () => {
    it('honors explicit revocation even for a master administrator', () => {
      expect(userCanCreateReservations(cristianShuteUser)).toBe(true);
      expect(userCanCreateReservations({ ...cristianShuteUser, canCreateReservations: false })).toBe(false);
    });

    it('defaults to true for standard roles and false for auxiliar', () => {
      expect(userCanCreateReservations(recepcionUser)).toBe(true);
      expect(userCanCreateReservations(coordinacionUser)).toBe(true);
      expect(userCanCreateReservations(auxiliarUser)).toBe(false);
    });

    it('honors Cristian Shute explicit toggle to deactivate creation for any user', () => {
      const blockedCoordinador: AuthUser = {
        ...coordinacionUser,
        canCreateReservations: false
      };
      const blockedRecepcion: AuthUser = {
        ...recepcionUser,
        canCreateReservations: false
      };
      expect(userCanCreateReservations(blockedCoordinador)).toBe(false);
      expect(userCanCreateReservations(blockedRecepcion)).toBe(false);
    });

    it('honors Cristian Shute explicit toggle to activate creation for auxiliar', () => {
      const enabledAuxiliar: AuthUser = {
        ...auxiliarUser,
        canCreateReservations: true
      };
      expect(userCanCreateReservations(enabledAuxiliar)).toBe(true);
    });
  });

  describe('userCanEditReservations', () => {
    it('honors explicit revocation even for a master administrator', () => {
      expect(userCanEditReservations(cristianShuteUser)).toBe(true);
      expect(userCanEditReservations({ ...cristianShuteUser, canEditReservations: false })).toBe(false);
    });

    it('defaults to true for Coordinador/Admin and false for Recepcion/Gestion/Auxiliar', () => {
      expect(userCanEditReservations(coordinacionUser)).toBe(true);
      expect(userCanEditReservations(recepcionUser)).toBe(false);
      expect(userCanEditReservations(auxiliarUser)).toBe(false);
    });

    it('honors Cristian Shute explicit toggle to deactivate editing on Coordinador', () => {
      const restrictedCoordinador: AuthUser = {
        ...coordinacionUser,
        canEditReservations: false
      };
      expect(userCanEditReservations(restrictedCoordinador)).toBe(false);
    });

    it('honors Cristian Shute explicit toggle to activate editing on Recepcion or Gestion', () => {
      const empoweredRecepcion: AuthUser = {
        ...recepcionUser,
        canEditReservations: true
      };
      expect(userCanEditReservations(empoweredRecepcion)).toBe(true);
    });
  });

  describe('userCanDeleteReservations', () => {
    it('honors explicit revocation even for a master administrator', () => {
      expect(userCanDeleteReservations(cristianShuteUser)).toBe(true);
      expect(userCanDeleteReservations({ ...cristianShuteUser, canDeleteReservations: false })).toBe(false);
    });

    it('defaults to true for Coordinador/Admin and false for Recepcion/Gestion/Auxiliar', () => {
      expect(userCanDeleteReservations(coordinacionUser)).toBe(true);
      expect(userCanDeleteReservations(recepcionUser)).toBe(false);
      expect(userCanDeleteReservations(auxiliarUser)).toBe(false);
    });

    it('honors Cristian Shute explicit toggle to deactivate deletion on Coordinador', () => {
      const safeCoordinador: AuthUser = {
        ...coordinacionUser,
        canDeleteReservations: false
      };
      expect(userCanDeleteReservations(safeCoordinador)).toBe(false);
    });

    it('honors Cristian Shute explicit toggle to activate deletion on Recepcion', () => {
      const empoweredRecepcion: AuthUser = {
        ...recepcionUser,
        canDeleteReservations: true
      };
      expect(userCanDeleteReservations(empoweredRecepcion)).toBe(true);
    });
  });
});
