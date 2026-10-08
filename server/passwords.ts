import crypto from "node:crypto";
import { promisify } from "node:util";
import type { UserAccount } from '../src/services/authService';
const scrypt = promisify(crypto.scrypt);
export async function hashPassword(password: string): Promise<string> {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 256
  )
    throw new Error("La contraseña debe tener entre 8 y 256 caracteres.");
  const salt = crypto.randomBytes(16).toString("hex"),
    derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
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
