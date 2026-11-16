export const CAKE_CAPACITY = 15;
export const CAKE_START = '2026-11-15';
export const CAKE_END = '2027-11-15';

export function isMunicipalActivity(type?: string) {
  return type?.trim().toUpperCase() === 'ACTIVIDAD MUNICIPAL';
}

export function isCakeDate(date?: string) {
  return Boolean(date && date >= CAKE_START && date <= CAKE_END);
}
