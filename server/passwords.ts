import crypto from "node:crypto";
import { promisify } from "node:util";
import type { UserAccount } from '../src/services/authService';
const scrypt = promisify(crypto.scrypt);
async function derivePasswordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function hashPassword(password: string): Promise<string> {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 256
  )
    throw new Error("La contraseña debe tener entre 8 y 256 caracteres.");
  return derivePasswordHash(password);
}

/** Compatibility is restricted to the salted digest emitted by the former app. */
export function verifyLegacyPassword(password: string, stored: string): boolean {
  if (typeof password !== 'string' || !password.length || password.length > 256 ||
      !/^[a-f\d]{64}$/i.test(stored || '')) return false;
  const digest = crypto.createHash('sha256').update(`espacios_community_salt_2026:${password}`).digest();
  return crypto.timingSafeEqual(digest, Buffer.from(stored, 'hex'));
}

/** Existing short passwords can migrate; newly assigned passwords still require eight characters. */
export async function hashVerifiedLegacyPassword(password: string, stored: string): Promise<string> {
  if (!verifyLegacyPassword(password, stored)) throw new Error('La clave anterior no es válida.');
  return derivePasswordHash(password);
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !/^scrypt\$[a-f\d]{32}\$[a-f\d]{128}$/i.test(stored || "")
  )
    return false;
  const [, salt, expected] = stored.split("$"),
    computed = (await scrypt(password, salt, 64)) as Buffer;
  return crypto.timingSafeEqual(computed, Buffer.from(expected, "hex"));
}
export function publicProfile(account: any) {
  const allowed=['username','name','role','initials','avatarColor','email','phone','createdAt','isCustom','isMasterAdmin','canCreateReservations','canEditReservations','canDeleteReservations'];
  const profile=Object.fromEntries(allowed.filter(key=>account[key]!==undefined).map(key=>[key,account[key]]));
  return { ...profile, passwordHash: "" } as UserAccount;
}
