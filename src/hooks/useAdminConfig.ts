import { useState, useEffect, useCallback } from 'react';
import {
  SpaceInfo,
  LoanType,
  ActivityTypeItem,
  EquipmentItem
} from '../types';
import {
  getStoredSpaces,
  saveSpaceItem,
  deleteSpaceItem,
  getStoredLoanTypes,
  saveLoanTypeItem,
  deleteLoanTypeItem,
  getStoredActivityTypes,
  saveActivityTypeItem,
  deleteActivityTypeItem,
  resetConfigToDefaults,
  reorderSpaces,
  subscribeToAdminConfig
} from '../services/adminConfigService';
import {
  getStoredEquipment,
  saveEquipmentItem,
  deleteEquipmentItem,
  resetEquipmentToDefaults,
  subscribeToEquipment
} from '../services/equipmentService';
import {
  UserAccount,
  AuthUser,
  getAllAuthorizedUsers,
  saveUserAccount,
  deleteUserAccount,
  resetUsersToDefault,
  subscribeToUsers,
  isCoordinatorOrAdmin
} from '../services/authService';

export interface UseAdminConfigReturn {
  spaces: SpaceInfo[];
  setSpaces: React.Dispatch<React.SetStateAction<SpaceInfo[]>>;
  loanTypes: LoanType[];
  setLoanTypes: React.Dispatch<React.SetStateAction<LoanType[]>>;
  activityTypes: ActivityTypeItem[];
  setActivityTypes: React.Dispatch<React.SetStateAction<ActivityTypeItem[]>>;
  equipment: EquipmentItem[];
  setEquipment: React.Dispatch<React.SetStateAction<EquipmentItem[]>>;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;

  handleSaveSpace: (space: SpaceInfo) => Promise<void>;
  handleDeleteSpace: (id: string) => Promise<void>;
  handleReorderSpaces: (newSpaces: SpaceInfo[]) => Promise<void>;
  handleSaveLoanType: (loan: LoanType) => Promise<void>;
  handleDeleteLoanType: (id: string) => Promise<void>;
  handleSaveActivityType: (act: ActivityTypeItem) => Promise<void>;
  handleDeleteActivityType: (id: string) => Promise<void>;
  handleSaveEquipment: (item: EquipmentItem) => Promise<void>;
  handleDeleteEquipment: (id: string) => Promise<void>;
  handleResetEquipment: () => Promise<void>;
  handleResetDefaults: () => Promise<void>;
  handleSaveUser: (user: UserAccount, originalUsername?: string) => Promise<void>;
  handleDeleteUser: (username: string) => Promise<{ success: boolean; message?: string; users?: UserAccount[] }>;
  handleResetUsers: () => Promise<void>;
}

export function useAdminConfig(
  currentUser: AuthUser | null,
  onToast: (msg: string, type?: 'success' | 'info' | 'error' | 'warning') => void,
  { equipmentEnabled = true }: { equipmentEnabled?: boolean } = {},
): UseAdminConfigReturn {
  const [spaces, setSpaces] = useState<SpaceInfo[]>(() => getStoredSpaces());
  const [loanTypes, setLoanTypes] = useState<LoanType[]>(() => getStoredLoanTypes());
  const [activityTypes, setActivityTypes] = useState<ActivityTypeItem[]>(() => getStoredActivityTypes());
  const [equipment, setEquipment] = useState<EquipmentItem[]>(() => getStoredEquipment());
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => getAllAuthorizedUsers());

  // Subscribe to Users from Firestore across all devices
  useEffect(() => {
    const unsubUsers = subscribeToUsers((data) => {
      setUserAccounts(data);
    });
    return () => {
      if (typeof unsubUsers === 'function') {
        unsubUsers();
      }
    };
  }, []);

  // Subscribe to Admin Configuration from Firestore (Spaces, Loans, Activities)
  useEffect(() => {
    const unsubConfig = subscribeToAdminConfig((data) => {
      if (data.spaces) setSpaces(data.spaces);
      if (data.loanTypes) setLoanTypes(data.loanTypes);
      if (data.activityTypes) setActivityTypes(data.activityTypes);
    });
    return () => {
      if (typeof unsubConfig === 'function') {
        unsubConfig();
      }
    };
  }, []);

  // Subscribe to Equipment Configuration from Firestore & Local Events
  useEffect(() => {
    if (!equipmentEnabled) return;
    const unsubEquipment = subscribeToEquipment((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setEquipment(data);
      }
    });

    const handleEquipmentUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<EquipmentItem[]>;
      if (customEvent.detail) {
        setEquipment(customEvent.detail);
      }
    };

    window.addEventListener('app_equipment_changed', handleEquipmentUpdate);

    return () => {
      if (typeof unsubEquipment === 'function') unsubEquipment();
      window.removeEventListener('app_equipment_changed', handleEquipmentUpdate);
    };
  }, [equipmentEnabled]);

  const handleSaveSpace = useCallback(async (space: SpaceInfo) => {
    const updated = await saveSpaceItem(space);
    setSpaces(updated);
  }, []);

  const handleDeleteSpace = useCallback(async (id: string) => {
    const updated = await deleteSpaceItem(id);
    setSpaces(updated);
  }, []);

  const handleReorderSpaces = useCallback(async (newSpaces: SpaceInfo[]) => {
    const updated = await reorderSpaces(newSpaces);
    setSpaces(updated);
  }, []);

  const handleSaveLoanType = useCallback(async (loan: LoanType) => {
    const updated = await saveLoanTypeItem(loan);
    setLoanTypes(updated);
  }, []);

  const handleDeleteLoanType = useCallback(async (id: string) => {
    const updated = await deleteLoanTypeItem(id);
    setLoanTypes(updated);
  }, []);

  const handleSaveActivityType = useCallback(async (act: ActivityTypeItem) => {
    const updated = await saveActivityTypeItem(act);
    setActivityTypes(updated);
  }, []);

  const handleDeleteActivityType = useCallback(async (id: string) => {
    const updated = await deleteActivityTypeItem(id);
    setActivityTypes(updated);
  }, []);

  const handleSaveEquipment = useCallback(async (item: EquipmentItem) => {
    const updated = await saveEquipmentItem(item);
    setEquipment(updated);
  }, []);

  const handleDeleteEquipment = useCallback(async (id: string) => {
    const updated = await deleteEquipmentItem(id);
    setEquipment(updated);
  }, []);

  const handleResetEquipment = useCallback(async () => {
    const updated = await resetEquipmentToDefaults();
    setEquipment(updated);
  }, []);

  const handleResetDefaults = useCallback(async () => {
    await resetConfigToDefaults();
    setSpaces(getStoredSpaces());
    setLoanTypes(getStoredLoanTypes());
    setActivityTypes(getStoredActivityTypes());
    setEquipment(getStoredEquipment());
  }, []);

  const handleSaveUser = useCallback(async (user: UserAccount, originalUsername?: string) => {
    if (!isCoordinatorOrAdmin(currentUser)) {
      onToast(
        'Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para crear o modificar usuarios.',
        'error'
      );
      throw new Error('No tienes permiso para guardar usuarios.');
    }
    const updated = await saveUserAccount(user, originalUsername);
    setUserAccounts(updated);
  }, [currentUser, onToast]);

  const handleDeleteUser = useCallback(async (username: string) => {
    if (!isCoordinatorOrAdmin(currentUser)) {
      onToast(
        'Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para eliminar usuarios.',
        'error'
      );
      return {
        success: false,
        message: 'Permiso denegado: Solo Administradores y Coordinadores pueden eliminar usuarios.'
      };
    }
    const res = await deleteUserAccount(username);
    if (res.success && res.users) {
      setUserAccounts(res.users);
    }
    return res;
  }, [currentUser, onToast]);

  const handleResetUsers = useCallback(async () => {
    if (!isCoordinatorOrAdmin(currentUser)) {
      onToast(
        'Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para restablecer usuarios.',
        'error'
      );
      return;
    }
    const updated = await resetUsersToDefault();
    setUserAccounts(updated);
  }, [currentUser, onToast]);

  return {
    spaces,
    setSpaces,
    loanTypes,
    setLoanTypes,
    activityTypes,
    setActivityTypes,
    equipment,
    setEquipment,
    userAccounts,
    setUserAccounts,
    handleSaveSpace,
    handleDeleteSpace,
    handleReorderSpaces,
    handleSaveLoanType,
    handleDeleteLoanType,
    handleSaveActivityType,
    handleDeleteActivityType,
    handleSaveEquipment,
    handleDeleteEquipment,
    handleResetEquipment,
    handleResetDefaults,
    handleSaveUser,
    handleDeleteUser,
    handleResetUsers
  };
}
