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

  handleSaveSpace: (space: SpaceInfo) => void;
  handleDeleteSpace: (id: string) => void;
  handleReorderSpaces: (newSpaces: SpaceInfo[]) => void;
  handleSaveLoanType: (loan: LoanType) => void;
  handleDeleteLoanType: (id: string) => void;
  handleSaveActivityType: (act: ActivityTypeItem) => void;
  handleDeleteActivityType: (id: string) => void;
  handleSaveEquipment: (item: EquipmentItem) => void;
  handleDeleteEquipment: (id: string) => void;
  handleResetEquipment: () => void;
  handleResetDefaults: () => void;
  handleSaveUser: (user: UserAccount, originalUsername?: string) => void;
  handleDeleteUser: (username: string) => { success: boolean; message?: string; users?: UserAccount[] };
  handleResetUsers: () => void;
}

export function useAdminConfig(
  currentUser: AuthUser | null,
  onToast: (msg: string, type?: 'success' | 'info' | 'error' | 'warning') => void
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
  }, []);

  const handleSaveSpace = useCallback((space: SpaceInfo) => {
    const updated = saveSpaceItem(space);
    setSpaces(updated);
  }, []);

  const handleDeleteSpace = useCallback((id: string) => {
    const updated = deleteSpaceItem(id);
    setSpaces(updated);
  }, []);

  const handleReorderSpaces = useCallback((newSpaces: SpaceInfo[]) => {
    const updated = reorderSpaces(newSpaces);
    setSpaces(updated);
  }, []);

  const handleSaveLoanType = useCallback((loan: LoanType) => {
    const updated = saveLoanTypeItem(loan);
    setLoanTypes(updated);
  }, []);

  const handleDeleteLoanType = useCallback((id: string) => {
    const updated = deleteLoanTypeItem(id);
    setLoanTypes(updated);
  }, []);

  const handleSaveActivityType = useCallback((act: ActivityTypeItem) => {
    const updated = saveActivityTypeItem(act);
    setActivityTypes(updated);
  }, []);

  const handleDeleteActivityType = useCallback((id: string) => {
    const updated = deleteActivityTypeItem(id);
    setActivityTypes(updated);
  }, []);

  const handleSaveEquipment = useCallback((item: EquipmentItem) => {
    const updated = saveEquipmentItem(item);
    setEquipment(updated);
  }, []);

  const handleDeleteEquipment = useCallback((id: string) => {
    const updated = deleteEquipmentItem(id);
    setEquipment(updated);
  }, []);

  const handleResetEquipment = useCallback(() => {
    const updated = resetEquipmentToDefaults();
    setEquipment(updated);
  }, []);

  const handleResetDefaults = useCallback(() => {
    resetConfigToDefaults();
    setSpaces(getStoredSpaces());
    setLoanTypes(getStoredLoanTypes());
    setActivityTypes(getStoredActivityTypes());
    setEquipment(getStoredEquipment());
  }, []);

  const handleSaveUser = useCallback((user: UserAccount, originalUsername?: string) => {
    if (!isCoordinatorOrAdmin(currentUser)) {
      onToast(
        'Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para crear o modificar usuarios.',
        'error'
      );
      return;
    }
    const updated = saveUserAccount(user, originalUsername);
    setUserAccounts(updated);
  }, [currentUser, onToast]);

  const handleDeleteUser = useCallback((username: string) => {
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
    const res = deleteUserAccount(username);
    if (res.success && res.users) {
      setUserAccounts(res.users);
    }
    return res;
  }, [currentUser, onToast]);

  const handleResetUsers = useCallback(() => {
    if (!isCoordinatorOrAdmin(currentUser)) {
      onToast(
        'Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para restablecer usuarios.',
        'error'
      );
      return;
    }
    const updated = resetUsersToDefault();
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
