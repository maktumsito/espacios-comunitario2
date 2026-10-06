import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { getDb } from '../firebase/config';

export interface AuthUser {
  username: string;
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  isCustom?: boolean;
  isMasterAdmin?: boolean;
  // Permisos granulares de reservas administrados exclusivamente por Cristian Shute:
  canCreateReservations?: boolean; // ¿Puede registrar nuevas reservas?
  canEditReservations?: boolean;   // ¿Puede editar o cambiar reservas existentes?
  canDeleteReservations?: boolean; // ¿Puede eliminar reservas?
}

export interface UserAccount extends AuthUser {
  passwordHash: string;
}

export const SALT = 'espacios_community_salt_2026';

export const DEFAULT_USERS: UserAccount[] = [
  {
    username: 'cristian shute',
    passwordHash: '9510d5e4c33995a59051a814673e8b66900b52e55e21d5423d92d0a696e407d9', // hash(shutito)
    name: 'Cristian Shute',
    role: 'Administrador',
    email: 'cristianshute@gmail.com',
    initials: 'CS',
    avatarColor: 'bg-blue-600',
    createdAt: '2026-01-01T00:00:00.000Z',
    isMasterAdmin: true,
    canCreateReservations: true,
    canEditReservations: true,
    canDeleteReservations: true
  },
  {
    username: 'patricio flores',
    passwordHash: '13348a25a554348c808ed7f17d19c217afabee17c22204e154ce2d90211a9031', // hash(florencia4012)
    name: 'Patricio Flores',
    role: 'Administrador',
    initials: 'PF',
    avatarColor: 'bg-emerald-600',
    createdAt: '2026-01-01T00:00:00.000Z',
    isMasterAdmin: true,
    canCreateReservations: true,
    canEditReservations: true,
    canDeleteReservations: true
  },
  {
    username: 'pato flores',
    passwordHash: '13348a25a554348c808ed7f17d19c217afabee17c22204e154ce2d90211a9031', // hash(florencia4012)
    name: 'Pato Flores',
    role: 'Administrador',
    initials: 'PF',
    avatarColor: 'bg-emerald-600',
    createdAt: '2026-01-01T00:00:00.000Z',
    isMasterAdmin: true,
    canCreateReservations: true,
    canEditReservations: true,
    canDeleteReservations: true
  },
  {
    username: 'gonzalo carrasco',
    passwordHash: '2ffc99c053cb30c25d87b8779d770c55a2308e8b3426c522b084007193904997', // hash(recepcion)
    name: 'Gonzalo Carrasco',
    role: 'Recepción',
    initials: 'GC',
    avatarColor: 'bg-indigo-600',
    createdAt: '2026-01-01T00:00:00.000Z',
    canCreateReservations: true,
    canEditReservations: false,
    canDeleteReservations: false
  },
  {
    username: 'miguel angel gomez',
    passwordHash: 'bf7054c8c909d45ff13cdc68334524438a9b2538c021353f78d33ded17e81d81', // hash(magomez)
    name: 'Miguel Ángel Gómez',
    role: 'Gestión',
    initials: 'MG',
    avatarColor: 'bg-violet-600',
    createdAt: '2026-01-01T00:00:00.000Z',
    canCreateReservations: true,
    canEditReservations: false,
    canDeleteReservations: false
  }
];

export const USER_ACCOUNTS_STORAGE_KEY = 'espacios_users_accounts_v2';
export const AUTH_SESSION_STORAGE_KEY = 'espacios_auth_user';
const USERS_COLLECTION = 'usuarios_sistema';

/**
 * Checks if a string is a 64-character hexadecimal SHA-256 hash
 */
export function isHexHash64(str: string): boolean {
  return /^[a-f0-9]{64}$/i.test((str || '').trim());
}

/**
 * Computes a SHA-256 hash using the Web Crypto API with a secure salt
 */
export async function hashPassword(password: string): Promise<string> {
  const clean = password.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${SALT}:${clean}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-subtle environments
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Verifies if an input password matches the stored password hash (or legacy plaintext)
 */
export async function verifyPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  const clean = inputPassword.trim();
  const stored = (storedHash || '').trim();
  if (!clean || !stored) return false;
  const computed = await hashPassword(clean);
  if (computed === stored) return true;
  // Backward compatibility fallback for legacy unhashed entries during migration
  if (clean === stored) return true;
  return false;
}

// -------------------------------------------------------------
// Rate Limiting & Anti-Brute-Force Lockout
// -------------------------------------------------------------
const LOCKOUT_STORAGE_KEY = 'espacios_login_lockout_v2';
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 60_000; // 60s cooldown

interface LockoutState {
  failedAttempts: number;
  lockedUntil: number;
}

export function getLockoutStatus(username?: string): { isLocked: boolean; remainingSeconds: number; attempts: number } {
  if (!isBrowser) return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  try {
    const key = `${LOCKOUT_STORAGE_KEY}_${(username || 'global').trim().toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { isLocked: false, remainingSeconds: 0, attempts: 0 };
    const parsed: LockoutState = JSON.parse(raw);
    const now = Date.now();
    if (parsed.lockedUntil > now) {
      const remainingSeconds = Math.ceil((parsed.lockedUntil - now) / 1000);
      return { isLocked: true, remainingSeconds, attempts: parsed.failedAttempts };
    }
    return { isLocked: false, remainingSeconds: 0, attempts: parsed.failedAttempts };
  } catch {
    return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  }
}

export function recordFailedAttempt(username?: string): { isLocked: boolean; remainingSeconds: number; attempts: number } {
  if (!isBrowser) return { isLocked: false, remainingSeconds: 0, attempts: 1 };
  try {
    const key = `${LOCKOUT_STORAGE_KEY}_${(username || 'global').trim().toLowerCase()}`;
    const status = getLockoutStatus(username);
    const attempts = status.attempts + 1;
    const now = Date.now();
    const isLocked = attempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = isLocked ? now + LOCKOUT_DURATION_MS : 0;
    
    localStorage.setItem(key, JSON.stringify({
      failedAttempts: isLocked ? 0 : attempts,
      lockedUntil: isLocked ? lockedUntil : 0
    }));

    return {
      isLocked,
      remainingSeconds: isLocked ? Math.ceil(LOCKOUT_DURATION_MS / 1000) : 0,
      attempts
    };
  } catch {
    return { isLocked: false, remainingSeconds: 0, attempts: 1 };
  }
}

export function resetFailedAttempts(username?: string): void {
  if (!isBrowser) return;
  try {
    const key = `${LOCKOUT_STORAGE_KEY}_${(username || 'global').trim().toLowerCase()}`;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------
// Session Token Helpers
// -------------------------------------------------------------
const SESSION_TOKEN_STORAGE_KEY = 'espacios_auth_token_v2';

export function createAuthSessionToken(user: AuthUser): string {
  const payload = {
    u: user.username,
    r: user.role,
    t: Date.now()
  };
  const token = typeof btoa !== 'undefined' ? btoa(JSON.stringify(payload)) : Buffer.from(JSON.stringify(payload)).toString('base64');
  if (isBrowser) {
    try {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore
    }
  }
  return token;
}

export function getAuthSessionToken(): string {
  if (!isBrowser) return '';
  try {
    return sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

// In-memory cache for fast synchronous lookup
let inMemoryUsers: UserAccount[] = [];

/**
 * Sanitizes a username to be a safe Firestore document ID
 */
export function sanitizeUsernameDocId(username: string): string {
  return encodeURIComponent(username.trim().toLowerCase()).replace(/\./g, '_');
}

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/**
 * Cleans an object to remove undefined properties before saving to Firestore
 */
function cleanUserForFirestore(user: UserAccount): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(user)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Obtiene todos los usuarios autorizados desde cache local / memoria
 */
export function getAllAuthorizedUsers(): UserAccount[] {
  if (inMemoryUsers.length > 0) {
    return inMemoryUsers;
  }
  if (!isBrowser) {
    inMemoryUsers = [...DEFAULT_USERS];
    return [...DEFAULT_USERS];
  }
  try {
    const raw = localStorage.getItem(USER_ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      inMemoryUsers = [...DEFAULT_USERS];
      localStorage.setItem(USER_ACCOUNTS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return [...DEFAULT_USERS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      inMemoryUsers = parsed;
      return parsed;
    }
    inMemoryUsers = [...DEFAULT_USERS];
    return [...DEFAULT_USERS];
  } catch (err) {
    console.error('Error loading authorized users:', err);
    inMemoryUsers = [...DEFAULT_USERS];
    return [...DEFAULT_USERS];
  }
}

/**
 * Guarda el listado completo de usuarios autorizados en local cache
 */
export function saveAllAuthorizedUsers(users: UserAccount[]): void {
  inMemoryUsers = users;
  if (!isBrowser) return;
  try {
    localStorage.setItem(USER_ACCOUNTS_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Error saving all authorized users to localStorage:', err);
  }
}

/**
 * Seeds default or cached users to Firestore if the collection is empty
 */
async function seedDefaultUsersToFirestore(): Promise<void> {
  try {
    const db = getDb();
    const batch = writeBatch(db);
    const localUsers = getAllAuthorizedUsers();
    const usersToSeed = localUsers.length > 0 ? localUsers : DEFAULT_USERS;
    for (const u of usersToSeed) {
      const docRef = doc(db, USERS_COLLECTION, sanitizeUsernameDocId(u.username));
      batch.set(docRef, cleanUserForFirestore(u), { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Could not seed default users to Firestore:', err);
  }
}

/**
 * Subscribes to real-time user updates from Firestore across all computers/devices
 * using a stale-while-revalidate pattern.
 */
export function subscribeToUsers(
  onUpdate: (users: UserAccount[], isLiveFromFirestore: boolean) => void,
  onError?: (error: Error) => void
): () => void {
  // 1. [STALE] Emit locally cached users immediately so login / UI works with 0ms perceived lag
  const localInitial = getAllAuthorizedUsers();
  onUpdate(localInitial, false);

  try {
    const db = getDb();
    const colRef = collection(db, USERS_COLLECTION);

    // 2. [REVALIDATE] Silently update from Firestore
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const remoteUsers: UserAccount[] = snapshot.docs.map((d) => d.data() as UserAccount);
          saveAllAuthorizedUsers(remoteUsers);
          onUpdate(remoteUsers, true);
        } else {
          // If Firestore collection is empty, seed defaults and provide local cache
          const local = getAllAuthorizedUsers();
          onUpdate(local, true);
          if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) seedDefaultUsersToFirestore();
        }
      },
      (err) => {
        console.warn('Firestore users subscription fallback to local cache:', err);
        const local = getAllAuthorizedUsers();
        onUpdate(local, false);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.warn('Error starting Firestore users subscription:', err);
    const local = getAllAuthorizedUsers();
    onUpdate(local, false);
    return () => {};
  }
}

/**
 * Guarda o actualiza un usuario individual y lo sincroniza con Firestore
 */
export async function saveUserAccount(user: UserAccount, originalUsername?: string): Promise<UserAccount[]> {
  const current = getAllAuthorizedUsers();
  const targetUsername = (originalUsername || user.username).trim().toLowerCase();
  
  const existingIdx = current.findIndex(
    (u) => u.username.trim().toLowerCase() === targetUsername
  );

  const cleanUser: UserAccount = {
    ...user,
    username: user.username.trim().toLowerCase(),
    createdAt: user.createdAt || new Date().toISOString()
  };

  let updatedList: UserAccount[];

  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = cleanUser;
  } else {
    updatedList = [...current, cleanUser];
  }

  const db = getDb();
  const batch = writeBatch(db);
  batch.set(doc(db, USERS_COLLECTION, sanitizeUsernameDocId(cleanUser.username)), cleanUserForFirestore(cleanUser));
  if (originalUsername && originalUsername.trim().toLowerCase() !== cleanUser.username) {
    batch.delete(doc(db, USERS_COLLECTION, sanitizeUsernameDocId(originalUsername)));
  }
  await batch.commit();
  saveAllAuthorizedUsers(updatedList);

  return updatedList;
}

/**
 * Identifica si un usuario posee privilegios de Super Administrador / Acceso Maestro.
 * Específicamente Cristian Shute y Patricio Flores (o Pato Flores) poseen acceso maestro absoluto y permanente.
 */
export function isMasterAdmin(user?: AuthUser | UserAccount | null): boolean {
  if (!user) return false;
  const username = (user.username || '').trim().toLowerCase();
  const name = (user.name || '').trim().toLowerCase();
  
  if (
    username === 'cristian shute' ||
    username === 'patricio flores' ||
    username === 'pato flores' ||
    name.includes('cristian shute') ||
    name.includes('patricio flores') ||
    name.includes('pato flores') ||
    user.isMasterAdmin === true
  ) {
    return true;
  }

  const role = (user.role || '').trim().toLowerCase();
  return role === 'administrador';
}

/**
 * Identifica si un usuario es específicamente Cristian Shute (Super Administrador titular y dueño de la cuenta maestra).
 */
export function isCristianShute(user?: AuthUser | UserAccount | null): boolean {
  if (!user) return false;
  const username = (user.username || '').trim().toLowerCase();
  const name = (user.name || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  
  return (
    username === 'cristian shute' ||
    username === 'shutito' ||
    name === 'cristian shute' ||
    name.includes('cristian shute') ||
    email === 'cristianshute@gmail.com'
  );
}

/**
 * Determina si el usuario tiene permiso para registrar nuevas reservas.
 * Cristian Shute siempre posee permiso maestro absoluto.
 * Si Cristian Shute configuró explícitamente el permiso en el usuario, se respeta la decisión.
 */
export function userCanCreateReservations(user?: AuthUser | UserAccount | null): boolean {
  if (!user) return false;
  if (isCristianShute(user) || isMasterAdmin(user)) return true;
  if (typeof user.canCreateReservations === 'boolean') {
    return user.canCreateReservations;
  }
  // Default por rol si aún no se ha configurado explícitamente:
  const role = (user.role || '').trim().toLowerCase();
  if (role === 'auxiliar' || role === 'tecnico' || role === 'técnico' || role.includes('operativo')) {
    return false;
  }
  return true;
}

/**
 * Determina si el usuario tiene permiso para editar o cambiar reservas existentes.
 * Cristian Shute siempre posee permiso maestro absoluto.
 * Si Cristian Shute configuró explícitamente el permiso en el usuario, se respeta la decisión.
 */
export function userCanEditReservations(user?: AuthUser | UserAccount | null): boolean {
  if (!user) return false;
  if (isCristianShute(user) || isMasterAdmin(user)) return true;
  if (typeof user.canEditReservations === 'boolean') {
    return user.canEditReservations;
  }
  // Default por rol si aún no se ha configurado explícitamente:
  return isCoordinatorOrAdmin(user);
}

/**
 * Determina si el usuario tiene permiso para eliminar reservas directamente.
 * Cristian Shute siempre posee permiso maestro absoluto.
 * Si Cristian Shute configuró explícitamente el permiso en el usuario, se respeta la decisión.
 */
export function userCanDeleteReservations(user?: AuthUser | UserAccount | null): boolean {
  if (!user) return false;
  if (isCristianShute(user) || isMasterAdmin(user)) return true;
  if (typeof user.canDeleteReservations === 'boolean') {
    return user.canDeleteReservations;
  }
  // Default por rol si aún no se ha configurado explícitamente:
  return isCoordinatorOrAdmin(user);
}


/**
 * Elimina un usuario por su username y lo borra de Firestore
 */
export async function deleteUserAccount(username: string): Promise<{ success: boolean; message?: string; users: UserAccount[] }> {
  const current = getAllAuthorizedUsers();
  const cleanUsername = username.trim().toLowerCase();

  // Validar que no eliminemos al último administrador
  const userToDelete = current.find((u) => u.username.trim().toLowerCase() === cleanUsername);
  if (!userToDelete) {
    return { success: false, message: 'Usuario no encontrado.', users: current };
  }

  // Protección de usuarios Super Administradores maestros
  if (
    cleanUsername === 'cristian shute' ||
    cleanUsername === 'patricio flores' ||
    cleanUsername === 'pato flores'
  ) {
    return {
      success: false,
      message: 'Este usuario posee privilegios maestros protegidos de Super Administrador y no puede ser eliminado.',
      users: current
    };
  }

  if (userToDelete.role === 'Administrador') {
    const adminCount = current.filter((u) => u.role === 'Administrador').length;
    if (adminCount <= 1) {
      return {
        success: false,
        message: 'No puedes eliminar al único Administrador del sistema.',
        users: current
      };
    }
  }

  const updatedList = current.filter((u) => u.username.trim().toLowerCase() !== cleanUsername);
  await deleteDoc(doc(getDb(), USERS_COLLECTION, sanitizeUsernameDocId(cleanUsername)));
  saveAllAuthorizedUsers(updatedList);

  return { success: true, users: updatedList };
}

/**
 * Permite a cualquier usuario autenticado cambiar su propia clave de acceso.
 * Valida la clave actual (a menos que un Super Admin realice una reasignación forzada),
 * actualiza el hash de contraseña en memoria, almacenamiento local y Firestore en tiempo real.
 */
export async function changeUserPassword(
  username: string,
  currentPasswordInput: string,
  newPasswordInput: string,
  isMasterOverride: boolean = false
): Promise<{ success: boolean; message: string; user?: AuthUser }> {
  const cleanUsername = username.trim().toLowerCase();
  const cleanCurrentPass = currentPasswordInput.trim();
  const cleanNewPass = newPasswordInput.trim();

  if (!cleanUsername) {
    return { success: false, message: 'Identificador de usuario no especificado.' };
  }

  if (!cleanNewPass) {
    return { success: false, message: 'La nueva clave de acceso no puede estar vacía.' };
  }

  if (cleanNewPass.length < 3) {
    return { success: false, message: 'La nueva clave debe tener al menos 3 caracteres.' };
  }

  // 1. Obtener lista de usuarios frescos (combinando local y Firestore)
  let currentUsers = getAllAuthorizedUsers();
  let userAccount = currentUsers.find((u) => u.username.trim().toLowerCase() === cleanUsername);

  if (!userAccount) {
    try {
      const db = getDb();
      const snap = await getDocs(collection(db, USERS_COLLECTION));
      if (!snap.empty) {
        currentUsers = snap.docs.map((d) => d.data() as UserAccount);
        saveAllAuthorizedUsers(currentUsers);
        userAccount = currentUsers.find((u) => u.username.trim().toLowerCase() === cleanUsername);
      }
    } catch (err) {
      console.warn('Error consultando Firestore para cambio de clave:', err);
    }
  }

  if (!userAccount) {
    return { success: false, message: `Usuario @${cleanUsername} no encontrado en el sistema.` };
  }

  // 2. Verificar contraseña actual (si no es reasignación maestra directa)
  if (!isMasterOverride) {
    const isCurrentValid = await verifyPassword(cleanCurrentPass, userAccount.passwordHash);
    if (!isCurrentValid) {
      return { success: false, message: 'La clave actual ingresada es incorrecta. Por favor verifica tu clave anterior.' };
    }
  }

  // 3. Crear usuario actualizado con nueva clave hasheada criptográficamente
  const hashedNewPass = await hashPassword(cleanNewPass);
  const updatedUser: UserAccount = {
    ...userAccount,
    passwordHash: hashedNewPass
  };

  // Guardar y sincronizar con Firestore
  try { await saveUserAccount(updatedUser, userAccount.username); }
  catch (err: any) { return { success: false, message: err?.message || "No se pudo guardar la nueva clave." }; }

  // Si el usuario actual en sesión es el mismo, actualizar datos de sesión
  const currentSession = getStoredAuthUser();
  if (currentSession && currentSession.username.trim().toLowerCase() === cleanUsername) {
    const { passwordHash: _, ...safeUser } = updatedUser;
    saveAuthUser(safeUser);
  }

  const { passwordHash: _, ...safeUpdated } = updatedUser;
  return {
    success: true,
    message: `¡Clave de acceso actualizada exitosamente para ${userAccount.name}! Ya puedes usar tu nueva clave en cualquier dispositivo.`,
    user: safeUpdated
  };
}

/**
 * Permite a los Administradores Maestros (Cristian Shute, Patricio Flores)
 * restablecer directamente la clave de acceso de cualquier usuario del sistema.
 */
export async function adminResetUserPassword(
  username: string,
  newPasswordInput: string
): Promise<{ success: boolean; message: string }> {
  return changeUserPassword(username, '', newPasswordInput, true);
}

/**
 * Restablece los usuarios a la lista por defecto y los sube a Firestore
 */
export async function resetUsersToDefault(): Promise<UserAccount[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  if (snap.size + DEFAULT_USERS.length > 450) throw new Error('Demasiados usuarios para restablecer de forma atómica.');
  const batch = writeBatch(db);
  snap.forEach(d=>batch.delete(d.ref));
  DEFAULT_USERS.forEach(u=>batch.set(doc(db,USERS_COLLECTION,sanitizeUsernameDocId(u.username)),cleanUserForFirestore(u)));
  await batch.commit();
  saveAllAuthorizedUsers(DEFAULT_USERS);
  return [...DEFAULT_USERS];
}

/**
 * Para retrocompatibilidad con componentes existentes
 */
export const AUTHORIZED_USERS = DEFAULT_USERS;

/**
 * Autenticación segura mediante usuario explícito y clave de acceso,
 * con protección contra fuerza bruta y verificación de hash criptográfico SHA-256.
 */
export async function authenticateUser(
  username: string,
  passwordInput: string,
  customUsersList?: UserAccount[]
): Promise<{ success: boolean; user?: AuthUser; error?: string; remainingSeconds?: number }> {
  const cleanUsername = username.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanUsername) {
    return { success: false, error: 'Por favor selecciona o ingresa tu usuario.' };
  }
  if (!cleanPass) {
    return { success: false, error: 'Por favor ingresa tu clave de acceso.' };
  }

  // 1. Verificación de bloqueo por intentos fallidos (Anti-Brute Force)
  const lockout = getLockoutStatus(cleanUsername);
  if (lockout.isLocked) {
    return {
      success: false,
      error: `Acceso bloqueado por seguridad tras múltiples intentos fallidos. Por favor espera ${lockout.remainingSeconds} segundos antes de reintentar.`,
      remainingSeconds: lockout.remainingSeconds
    };
  }

  // 2. Localizar cuenta de usuario
  let users = customUsersList && customUsersList.length > 0 ? customUsersList : getAllAuthorizedUsers();
  let found = users.find((u) => u.username.trim().toLowerCase() === cleanUsername);

  // Si no está en cache local, consultar Firestore
  if (!found) {
    try {
      const db = getDb();
      const docSnap = await getDoc(doc(db, USERS_COLLECTION, sanitizeUsernameDocId(cleanUsername)));
      if (docSnap.exists()) {
        found = docSnap.data() as UserAccount;
        saveUserAccount(found);
      }
    } catch (err) {
      console.warn('Direct Firestore user lookup failed:', err);
    }
  }

  if (!found) {
    recordFailedAttempt(cleanUsername);
    return { success: false, error: 'Usuario no encontrado en el sistema.' };
  }

  // 3. Verificación de clave con hash SHA-256
  const isValid = await verifyPassword(cleanPass, found.passwordHash);
  if (!isValid) {
    const failRes = recordFailedAttempt(cleanUsername);
    if (failRes.isLocked) {
      return {
        success: false,
        error: `Acceso bloqueado por seguridad: has superado el límite de 5 intentos. Espera ${failRes.remainingSeconds} segundos.`,
        remainingSeconds: failRes.remainingSeconds
      };
    }
    return {
      success: false,
      error: `Clave de acceso incorrecta. Intentos restantes antes del bloqueo: ${MAX_FAILED_ATTEMPTS - failRes.attempts}.`
    };
  }

  // 4. Éxito: restablecer intentos fallidos
  resetFailedAttempts(cleanUsername);

  // Si la clave estaba en texto plano en la base de datos, migrarla automáticamente a hash SHA-256
  if (found.passwordHash === cleanPass) {
    try {
      const secureHash = await hashPassword(cleanPass);
      const upgradedUser: UserAccount = { ...found, passwordHash: secureHash };
      saveUserAccount(upgradedUser);
    } catch {
      // ignore
    }
  }

  const { passwordHash: _, ...userSafe } = found;
  createAuthSessionToken(userSafe);
  saveAuthUser(userSafe);

  return { success: true, user: userSafe };
}

/**
 * Autentica sincrónicamente con soporte para hash SHA-256 y texto plano
 */
export function authenticateByPassword(passwordInput: string, customUsersList?: UserAccount[]): AuthUser | null {
  const cleanPass = passwordInput.trim();
  if (!cleanPass) return null;

  const users = customUsersList || getAllAuthorizedUsers();
  // Check exact match (or precomputed SHA-256 matches)
  const found = users.find((u) => {
    if (u.passwordHash === cleanPass) return true;
    return false;
  });

  if (found) {
    const { passwordHash: _, ...userSafe } = found;
    createAuthSessionToken(userSafe);
    return userSafe;
  }

  return null;
}

/**
 * Autentica de forma asíncrona verificando hash criptográfico contra la base de datos
 */
export async function authenticateByPasswordAsync(passwordInput: string, customUsersList?: UserAccount[]): Promise<AuthUser | null> {
  const cleanPass = passwordInput.trim();
  if (!cleanPass) return null;

  const users = customUsersList || getAllAuthorizedUsers();
  for (const u of users) {
    if (await verifyPassword(cleanPass, u.passwordHash)) {
      const { passwordHash: _, ...userSafe } = u;
      createAuthSessionToken(userSafe);
      return userSafe;
    }
  }

  // Fallback direct Firestore lookup
  try {
    const db = getDb();
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    if (!snap.empty) {
      const freshUsers = snap.docs.map((d) => d.data() as UserAccount);
      saveAllAuthorizedUsers(freshUsers);
      for (const u of freshUsers) {
        if (await verifyPassword(cleanPass, u.passwordHash)) {
          const { passwordHash: _, ...userSafe } = u;
          createAuthSessionToken(userSafe);
          return userSafe;
        }
      }
    }
  } catch (err) {
    console.warn('Error en consulta directa a Firestore para autenticación:', err);
  }

  return null;
}

export function isCoordinatorOrAdmin(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  return role === 'administrador' || role === 'coordinador';
}

export function isAuxiliar(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  return role === 'auxiliar' || role === 'tecnico' || role === 'técnico' || role.includes('operativo');
}

/**
 * Denominación única, unificada y coherente para los roles del sistema
 */
export function getRoleDisplayName(role?: string): string {
  if (!role) return 'Usuario';
  const r = role.trim().toLowerCase();
  if (r === 'administrador') return 'Administrador';
  if (r === 'coordinador') return 'Coordinador';
  if (r === 'recepción' || r === 'recepcion') return 'Recepción';
  if (r === 'gestión' || r === 'gestion') return 'Gestión';
  if (r === 'auxiliar' || r === 'tecnico' || r === 'técnico' || r.includes('operativo')) {
    return 'Personal Auxiliar (Operativo)';
  }
  return role;
}

/**
 * Control estricto RBAC: Solo Administrador y Coordinador pueden realizar
 * importaciones masivas o sincronización destructiva con Firestore
 */
export function canPerformMassDataSync(user?: AuthUser | null): boolean {
  return isCoordinatorOrAdmin(user);
}

export function canAccessAdminPanel(user?: AuthUser | null): boolean {
  if (!user) return false;
  return true;
}

export function canManageMasterConfig(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  return role === 'administrador' || role === 'coordinador';
}

/**
 * Solo usuarios Administrador o Coordinador pueden ver el registro de auditoría/cambios y deshacerlos
 */
export function canViewAuditLog(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  return role === 'administrador' || role === 'coordinador';
}

// Duración de la sesión: 1 hora exacta (60 minutos = 3.600.000 ms)
export const SESSION_DURATION_MS = 60 * 60 * 1000;
export const AUTH_SESSION_EXPIRY_KEY = 'espacios_auth_session_expiry_v1';
export const AUTH_SESSION_START_KEY = 'espacios_auth_session_start_v1';

/**
 * Retorna los milisegundos restantes de la sesión actual (o 0 si ya expiró)
 */
export function getSessionRemainingMs(): number {
  if (!isBrowser) return 0;
  try {
    const expiryRaw = localStorage.getItem(AUTH_SESSION_EXPIRY_KEY);
    if (!expiryRaw) return 0;
    const expiresAt = parseInt(expiryRaw, 10);
    if (isNaN(expiresAt)) return 0;
    const remaining = expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

/**
 * Verifica si la sesión de 1 hora ha caducado
 */
export function isSessionExpired(): boolean {
  if (!isBrowser) return true;
  const user = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!user) return true;
  const expiryRaw = localStorage.getItem(AUTH_SESSION_EXPIRY_KEY);
  if (!expiryRaw) {
    // Missing or corrupted expiry is untrusted: treat as expired
    return true;
  }
  const expiresAt = parseInt(expiryRaw, 10);
  if (isNaN(expiresAt)) return true;

  // Enforce absolute maximum session ceiling (12 hours) from initial session start
  const startRaw = localStorage.getItem(AUTH_SESSION_START_KEY);
  if (startRaw) {
    const startedAt = parseInt(startRaw, 10);
    const MAX_ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;
    if (!isNaN(startedAt) && Date.now() - startedAt > MAX_ABSOLUTE_SESSION_MS) {
      return true;
    }
  }

  return Date.now() >= expiresAt;
}

/**
 * Renueva o reinicia el reloj de la sesión por hasta 1 hora adicional
 */
export function refreshSession(durationMs: number = SESSION_DURATION_MS): void {
  if (!isBrowser) return;
  try {
    const userRaw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!userRaw || isSessionExpired()) {
      clearAuthUser();
      return;
    }
    const boundedDuration = Math.min(Math.max(durationMs, 60000), SESSION_DURATION_MS);
    const now = Date.now();
    const expiresAt = now + boundedDuration;
    localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, expiresAt.toString());
  } catch (err) {
    console.error('Error refreshing session', err);
  }
}

export function getStoredAuthUser(): AuthUser | null {
  if (!isBrowser) return null;
  try {
    if (isSessionExpired()) {
      clearAuthUser();
      return null;
    }
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Retorna el usuario actualmente autenticado en la sesión
 */
export function getCurrentUser(): AuthUser | null {
  return getStoredAuthUser();
}

export function saveAuthUser(user: AuthUser, durationMs: number = SESSION_DURATION_MS): void {
  if (!isBrowser) return;
  try {
    const now = Date.now();
    const boundedDuration = Math.min(Math.max(durationMs, 60000), SESSION_DURATION_MS);
    const expiresAt = now + boundedDuration;
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, expiresAt.toString());
    localStorage.setItem(AUTH_SESSION_START_KEY, now.toString());
  } catch (err) {
    console.error('Error saving auth user', err);
  }
}

export function clearAuthUser(): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    localStorage.removeItem(AUTH_SESSION_EXPIRY_KEY);
    localStorage.removeItem(AUTH_SESSION_START_KEY);
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    sessionStorage.clear();
  } catch (err) {
    console.error('Error clearing auth user', err);
  }
}

