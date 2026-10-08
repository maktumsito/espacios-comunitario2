import { dataRequest, announceDataChange } from "../firebase/gateway";
import { sharedOnSnapshot as onSnapshot } from "../firebase/sharedSnapshot";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  writeBatch,
} from "../firebase/gateway";
import { getDb } from "../firebase/config";

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
  canEditReservations?: boolean; // ¿Puede editar o cambiar reservas existentes?
  canDeleteReservations?: boolean; // ¿Puede eliminar reservas?
}

export interface UserAccount extends AuthUser {
  passwordHash: string;
}

/** Google identities must match an explicitly registered email, never a substring. */
export function findAuthorizedGoogleAccount(
  email: string,
  users: readonly UserAccount[],
): AuthUser | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const account = users.find(
    (user) => (user.email || user.username).trim().toLowerCase() === normalized,
  );
  if (!account) return null;
  const { passwordHash: _password, ...safe } = account;
  return safe;
}

export const DEFAULT_USERS: UserAccount[] = [];

export const USER_ACCOUNTS_STORAGE_KEY = "espacios_users_accounts_v2";
export const AUTH_SESSION_STORAGE_KEY = "espacios_auth_user";
const USERS_COLLECTION = "usuarios_sistema";

// Password verification runs exclusively on the server.

// -------------------------------------------------------------
// Rate Limiting & Anti-Brute-Force Lockout
// -------------------------------------------------------------
const LOCKOUT_STORAGE_KEY = "espacios_login_lockout_v2";
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 60_000; // 60s cooldown

interface LockoutState {
  failedAttempts: number;
  lockedUntil: number;
}

export function getLockoutStatus(username?: string): {
  isLocked: boolean;
  remainingSeconds: number;
  attempts: number;
} {
  if (!isBrowser) return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  try {
    const key = `${LOCKOUT_STORAGE_KEY}_${(username || "global").trim().toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { isLocked: false, remainingSeconds: 0, attempts: 0 };
    const parsed: LockoutState = JSON.parse(raw);
    const now = Date.now();
    if (parsed.lockedUntil > now) {
      const remainingSeconds = Math.ceil((parsed.lockedUntil - now) / 1000);
      return {
        isLocked: true,
        remainingSeconds,
        attempts: parsed.failedAttempts,
      };
    }
    return {
      isLocked: false,
      remainingSeconds: 0,
      attempts: parsed.failedAttempts,
    };
  } catch {
    return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  }
}

export function recordFailedAttempt(username?: string): {
  isLocked: boolean;
  remainingSeconds: number;
  attempts: number;
} {
  if (!isBrowser) return { isLocked: false, remainingSeconds: 0, attempts: 1 };
  try {
    const key = `${LOCKOUT_STORAGE_KEY}_${(username || "global").trim().toLowerCase()}`;
    const status = getLockoutStatus(username);
    const attempts = status.attempts + 1;
    const now = Date.now();
    const isLocked = attempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = isLocked ? now + LOCKOUT_DURATION_MS : 0;

    localStorage.setItem(
      key,
      JSON.stringify({
        failedAttempts: isLocked ? 0 : attempts,
        lockedUntil: isLocked ? lockedUntil : 0,
      }),
    );

    return {
      isLocked,
      remainingSeconds: isLocked ? Math.ceil(LOCKOUT_DURATION_MS / 1000) : 0,
      attempts,
    };
  } catch {
    return { isLocked: false, remainingSeconds: 0, attempts: 1 };
  }
}

export function resetFailedAttempts(username?: string): void {
  if (!isBrowser) return;
  try {
    const key = `${LOCKOUT_STORAGE_KEY}_${(username || "global").trim().toLowerCase()}`;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------
// Session Token Helpers
// -------------------------------------------------------------
const SESSION_TOKEN_STORAGE_KEY = "espacios_auth_token_v2";
let verifiedSessionToken = "";

async function requestVerifiedSession(
  path: string,
  body: Record<string, string>,
): Promise<{
  success: boolean;
  user?: AuthUser;
  error?: string;
  remainingSeconds?: number;
  status?: number;
  expiresAt?: number;
}> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAuthSessionToken()
        ? { Authorization: `Bearer ${getAuthSessionToken()}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (
    !response.ok ||
    !result.success ||
    !result.user ||
    typeof result.token !== "string"
  ) {
    return {
      success: false,
      error: result.error || "La cuenta no tiene acceso.",
      remainingSeconds: result.remainingSeconds,
      status: response.status,
    };
  }
  verifiedSessionToken = result.token;
  try {
    sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, result.token);
    localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, result.token);
  } catch {
    /* The current browser session can still use its in-memory token. */
  }
  window.dispatchEvent(new Event("auth-session-changed"));
  return {
    success: true,
    user: result.user,
    expiresAt:
      typeof result.expiresAt === "number" ? result.expiresAt : undefined,
  };
}

export async function authenticateGoogleSession(
  username: string,
  idToken: string,
): Promise<AuthUser> {
  const result = await requestVerifiedSession("google-session", {
    username,
    idToken,
  });
  if (!result.success || !result.user)
    throw new Error(result.error || "Google no confirmó el acceso.");
  saveAuthUser(result.user);
  return result.user;
}

export function getAuthSessionToken(): string {
  if (!isBrowser) return "";
  if (verifiedSessionToken) return verifiedSessionToken;
  try {
    return (
      sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) ||
      localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) ||
      ""
    );
  } catch {
    return "";
  }
}

// In-memory cache for fast synchronous lookup
let inMemoryUsers: UserAccount[] = [];

/**
 * Sanitizes a username to be a safe Firestore document ID
 */
export function sanitizeUsernameDocId(username: string): string {
  return encodeURIComponent(username.trim().toLowerCase()).replace(/\./g, "_");
}

const isBrowser =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

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
  if (inMemoryUsers.length) return inMemoryUsers;
  try {
    const parsed = isBrowser
      ? JSON.parse(localStorage.getItem(USER_ACCOUNTS_STORAGE_KEY) || "[]")
      : [];
    if (Array.isArray(parsed)) {
      saveAllAuthorizedUsers(parsed);
      return inMemoryUsers;
    }
  } catch {}
  return [];
}

/**
 * Guarda el listado completo de usuarios autorizados en local cache
 */
export function saveAllAuthorizedUsers(users: UserAccount[]): void {
  users = users.map(
    ({
      passwordHash: _secret,
      password: _plain,
      sessionVersion: _version,
      ...profile
    }: any) => ({ ...profile, passwordHash: "" }),
  );
  inMemoryUsers = users;
  if (!isBrowser) return;
  try {
    localStorage.setItem(USER_ACCOUNTS_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error("Error saving all authorized users to localStorage:", err);
  }
}

/**
 * Subscribes to real-time user updates from Firestore across all computers/devices
 * using a stale-while-revalidate pattern.
 */
export function subscribeToUsers(
  onUpdate: (users: UserAccount[], isLiveFromFirestore: boolean) => void,
  onError?: (error: Error) => void,
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
          const remoteUsers: UserAccount[] = snapshot.docs.map(
            (d) => d.data() as UserAccount,
          );
          saveAllAuthorizedUsers(remoteUsers);
          onUpdate(remoteUsers, true);
        } else {
          // If Firestore collection is empty, seed defaults and provide local cache
          const local = getAllAuthorizedUsers();
          onUpdate(local, true);
          saveAllAuthorizedUsers([]);
          onUpdate([], true);
        }
      },
      (err) => {
        console.warn(
          "Firestore users subscription fallback to local cache:",
          err,
        );
        const local = getAllAuthorizedUsers();
        onUpdate(local, false);
        if (onError) onError(err);
      },
    );

    return unsubscribe;
  } catch (err: any) {
    console.warn("Error starting Firestore users subscription:", err);
    const local = getAllAuthorizedUsers();
    onUpdate(local, false);
    return () => {};
  }
}

/**
 * Guarda o actualiza un usuario individual y lo sincroniza con Firestore
 */
export async function saveUserAccount(
  user: UserAccount,
  originalUsername?: string,
): Promise<UserAccount[]> {
  const { passwordHash, ...profile } = user;
  const result = await dataRequest("/api/users/save", {
    user: profile,
    originalUsername,
    password: passwordHash || undefined,
  });
  saveAllAuthorizedUsers(result.users);
  announceDataChange();
  return getAllAuthorizedUsers();
}

/**
 * Identifica si un usuario posee privilegios de Super Administrador / Acceso Maestro.
 * Específicamente Cristian Shute y Patricio Flores (o Pato Flores) poseen acceso maestro absoluto y permanente.
 */
export function isMasterAdmin(user?: AuthUser | null): boolean {
  return user?.isMasterAdmin === true;
}

/**
 * Identifica si un usuario es específicamente Cristian Shute (Super Administrador titular y dueño de la cuenta maestra).
 */
export function isCristianShute(user?: AuthUser | null): boolean {
  return (
    !!user && user.isMasterAdmin===true &&
    ["cristian shute"].includes(user.username.trim().toLowerCase())
  );
}

/**
 * Determina si el usuario tiene permiso para registrar nuevas reservas.
 * Cristian Shute siempre posee permiso maestro absoluto.
 * Si Cristian Shute configuró explícitamente el permiso en el usuario, se respeta la decisión.
 */
export function userCanCreateReservations(
  user?: AuthUser | UserAccount | null,
): boolean {
  if (!user) return false;

  if (typeof user.canCreateReservations === "boolean") {
    return user.canCreateReservations;
  }
  // Default por rol si aún no se ha configurado explícitamente:
  const role = (user.role || "").trim().toLowerCase();
  if (
    role === "auxiliar" ||
    role === "tecnico" ||
    role === "técnico" ||
    role.includes("operativo")
  ) {
    return false;
  }
  return (
    isCoordinatorOrAdmin(user) ||
    ["recepción", "recepcion", "gestión", "gestion"].includes(role)
  );
}

/**
 * Determina si el usuario tiene permiso para editar o cambiar reservas existentes.
 * Cristian Shute siempre posee permiso maestro absoluto.
 * Si Cristian Shute configuró explícitamente el permiso en el usuario, se respeta la decisión.
 */
export function userCanEditReservations(
  user?: AuthUser | UserAccount | null,
): boolean {
  if (!user) return false;

  if (typeof user.canEditReservations === "boolean") {
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
export function userCanDeleteReservations(
  user?: AuthUser | UserAccount | null,
): boolean {
  if (!user) return false;

  if (typeof user.canDeleteReservations === "boolean") {
    return user.canDeleteReservations;
  }
  // Default por rol si aún no se ha configurado explícitamente:
  return isCoordinatorOrAdmin(user);
}

/**
 * Elimina un usuario por su username y lo borra de Firestore
 */
export async function deleteUserAccount(
  username: string,
): Promise<{ success: boolean; message?: string; users: UserAccount[] }> {
  try {
    const r = await dataRequest("/api/users/delete", { username });
    saveAllAuthorizedUsers(r.users);
    return { success: true, users: getAllAuthorizedUsers() };
  } catch (e: any) {
    return {
      success: false,
      message: e.message,
      users: getAllAuthorizedUsers(),
    };
  }
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
  isMasterOverride = false,
): Promise<{ success: boolean; message: string; user?: AuthUser }> {
  try {
    const r = await dataRequest("/api/users/password", {
      username,
      currentPassword: currentPasswordInput,
      newPassword: newPasswordInput,
      override: isMasterOverride,
    });
    if (getStoredAuthUser()?.username === username) clearAuthUser();
    return { success: true, message: r.message };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

/**
 * Permite a los Administradores Maestros (Cristian Shute, Patricio Flores)
 * restablecer directamente la clave de acceso de cualquier usuario del sistema.
 */
export async function adminResetUserPassword(
  username: string,
  newPasswordInput: string,
): Promise<{ success: boolean; message: string }> {
  return changeUserPassword(username, "", newPasswordInput, true);
}

/**
 * Restablece los usuarios a la lista por defecto y los sube a Firestore
 */
export async function resetUsersToDefault(): Promise<UserAccount[]> {
  throw new Error(
    "Las cuentas predeterminadas se retiraron. Administra perfiles individuales.",
  );
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
  _customUsersList?: UserAccount[],
): Promise<{
  success: boolean;
  user?: AuthUser;
  error?: string;
  remainingSeconds?: number;
}> {
  const cleanUsername = username.trim().toLowerCase();
  const cleanPass = passwordInput.trim();
  if (!cleanUsername || !cleanPass)
    return { success: false, error: "Usuario y contraseña son obligatorios." };
  const lockout = getLockoutStatus(cleanUsername);
  if (lockout.isLocked)
    return {
      success: false,
      error: "Acceso bloqueado temporalmente.",
      remainingSeconds: lockout.remainingSeconds,
    };
  try {
    const result = await requestVerifiedSession("session", {
      username: cleanUsername,
      password: cleanPass,
    });
    if (!result.success || !result.user) {
      if (result.status === 401 || result.status === 429)
        recordFailedAttempt(cleanUsername);
      return result;
    }
    resetFailedAttempts(cleanUsername);
    saveAuthUser(result.user);
    return { success: true, user: result.user };
  } catch {
    return {
      success: false,
      error:
        "No se pudo verificar la cuenta en el servidor. Intenta nuevamente.",
    };
  }
}

/**
 * Previsualiza una cuenta legada en el formulario, sin emitir ni cambiar la sesión.
 */
export function authenticateByPassword(
  _password: string,
  _users?: UserAccount[],
): AuthUser | null {
  return null;
}
export async function authenticateByPasswordAsync(
  password: string,
  users?: UserAccount[],
): Promise<AuthUser | null> {
  const u = users?.length === 1 ? users[0] : getStoredAuthUser();
  if (!u) return null;
  return (await authenticateUser(u.username, password)).user || null;
}

export function isCoordinatorOrAdmin(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || "").trim().toLowerCase();
  return role === "administrador" || role === "coordinador";
}

export function isAuxiliar(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || "").trim().toLowerCase();
  return (
    role === "auxiliar" ||
    role === "tecnico" ||
    role === "técnico" ||
    role.includes("operativo")
  );
}

/**
 * Denominación única, unificada y coherente para los roles del sistema
 */
export function getRoleDisplayName(role?: string): string {
  if (!role) return "Usuario";
  const r = role.trim().toLowerCase();
  if (r === "administrador") return "Administrador";
  if (r === "coordinador") return "Coordinador";
  if (r === "recepción" || r === "recepcion") return "Recepción";
  if (r === "gestión" || r === "gestion") return "Gestión";
  if (
    r === "auxiliar" ||
    r === "tecnico" ||
    r === "técnico" ||
    r.includes("operativo")
  ) {
    return "Personal Auxiliar (Operativo)";
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
  const role = (user.role || "").trim().toLowerCase();
  return role === "administrador" || role === "coordinador";
}

/**
 * Solo usuarios Administrador o Coordinador pueden ver el registro de auditoría/cambios y deshacerlos
 */
export function canViewAuditLog(user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = (user.role || "").trim().toLowerCase();
  return role === "administrador" || role === "coordinador";
}

// Duración de la sesión: 1 hora exacta (60 minutos = 3.600.000 ms)
export const SESSION_DURATION_MS = 60 * 60 * 1000;
export const AUTH_SESSION_EXPIRY_KEY = "espacios_auth_session_expiry_v1";
export const AUTH_SESSION_START_KEY = "espacios_auth_session_start_v1";

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
export async function refreshSession(
  durationMs: number = SESSION_DURATION_MS,
): Promise<void> {
  if (!isBrowser) return;
  try {
    const userRaw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!userRaw || isSessionExpired()) {
      clearAuthUser();
      return;
    }
    const refreshed = await requestVerifiedSession("session/refresh", {});
    if (!refreshed.success)
      throw new Error(
        refreshed.error || "Inicia sesión nuevamente para renovar el acceso.",
      );
    const boundedDuration = Math.min(
      Math.max(durationMs, 60000),
      SESSION_DURATION_MS,
    );
    const now = Date.now();
    const expiresAt = Math.min(
      now + boundedDuration,
      refreshed.expiresAt ?? Infinity,
    );
    localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, expiresAt.toString());
  } catch (err) {
    throw err;
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

export function saveAuthUser(
  user: AuthUser,
  durationMs: number = SESSION_DURATION_MS,
): void {
  if (!isBrowser) return;
  try {
    const now = Date.now();
    const boundedDuration = Math.min(
      Math.max(durationMs, 60000),
      SESSION_DURATION_MS,
    );
    const expiresAt = now + boundedDuration;
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, expiresAt.toString());
    localStorage.setItem(AUTH_SESSION_START_KEY, now.toString());
  } catch (err) {
    console.error("Error saving auth user", err);
  }
}

export function clearAuthUser(): void {
  verifiedSessionToken = "";
  if (!isBrowser) return;
  try {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    localStorage.removeItem(AUTH_SESSION_EXPIRY_KEY);
    localStorage.removeItem(AUTH_SESSION_START_KEY);
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    window.dispatchEvent(new Event("auth-session-changed"));
  } catch (err) {
    console.error("Error clearing auth user", err);
  }
}
