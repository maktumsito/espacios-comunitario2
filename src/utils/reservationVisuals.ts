import type { ActivityTypeItem, Reservation } from '../types';
import { DEFAULT_ACTIVITY_ITEMS } from '../data/activityTypes';

export interface ReservationTypeVisual {
  key: string;
  label: string;
  accent: string;
  background: string;
  border: string;
}

export const normalizeActivityType = (value?: string): string =>
  (value || 'OTROS').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase() || 'OTROS';

const COLOR_PALETTE = [
  '#0284c7', '#059669', '#7c3aed', '#ea580c', '#4f46e5', '#0891b2',
  '#2563eb', '#d97706', '#64748b', '#be185d', '#4d7c0f', '#a21caf',
  '#0f766e', '#b91c1c', '#854d0e', '#4338ca', '#0369a1', '#15803d',
];
// Keep the conflict indicator distinct from activity types.
const CONFLICT_COLOR = '#e11d48';

function normalizeColor(color?: string): string | undefined {
  const value = color?.trim().toLowerCase();
  if (value && /^#[0-9a-f]{6}$/.test(value)) return value;
  if (value && /^#[0-9a-f]{3}$/.test(value)) {
    return '#' + [...value.slice(1)].map(c => c + c).join('');
  }
  return undefined;
}

function colorFromName(name: string, attempt = 0): string {
  let hash = 2166136261;
  for (const char of `${normalizeActivityType(name)}:${attempt}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  // Dark channels keep generated colors readable with white text.
  return '#' + [0, 8, 16].map(shift => (32 + ((hash >>> shift) & 127)).toString(16).padStart(2, '0')).join('');
}

export function getAvailableActivityColor(
  colors: Iterable<string>, preferred?: string, name = 'ACTIVIDAD'
): string {
  const used = new Set([...colors].map(normalizeColor));
  used.add(CONFLICT_COLOR);
  const requested = normalizeColor(preferred);
  if (requested && !used.has(requested)) return requested;
  const available = COLOR_PALETTE.find(color => !used.has(color));
  if (available) return available;
  for (let attempt = 0; ; attempt++) {
    const generated = colorFromName(name, attempt);
    if (!used.has(generated)) return generated;
  }
}

/** Repair duplicate/invalid colors while preserving every other configured color. */
export function assignUniqueActivityColors(items: readonly ActivityTypeItem[]): ActivityTypeItem[] {
  const used = new Set([CONFLICT_COLOR]);
  const colors = items.map(item => {
    const color = normalizeColor(item.color);
    if (!color || used.has(color)) return undefined;
    used.add(color);
    return color;
  });
  return items.map((item, index) => {
    const color = colors[index] ?? getAvailableActivityColor(used, undefined, item.name);
    used.add(color);
    return { ...item, color };
  });
}

function tint(color: string, white: number): string {
  return '#' + [1, 3, 5].map(offset => {
    const channel = parseInt(color.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * white).toString(16).padStart(2, '0');
  }).join('');
}

function visualForType(name: string, color: string): ReservationTypeVisual {
  return {
    key: normalizeActivityType(name), label: formatDisplayTitle(name), accent: color,
    background: tint(color, 0.94), border: tint(color, 0.7),
  };
}

export function getActivityColorText(color: string): string {
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.179 ? '#0f172a' : '#ffffff';
}

export function createReservationVisualRegistry(
  activityTypes: readonly ActivityTypeItem[] = DEFAULT_ACTIVITY_ITEMS,
  reservations: readonly Pick<Reservation, 'tipoActividad'>[] = []
) {
  const byName = new Map(activityTypes.map(item => [normalizeActivityType(item.name), item]));
  // Retain exact colors for older built-in types removed from the current catalogue.
  for (const item of DEFAULT_ACTIVITY_ITEMS) {
    const key = normalizeActivityType(item.name);
    if (!byName.has(key)) byName.set(key, item);
  }
  const visuals = new Map<string, ReservationTypeVisual>();
  for (const item of assignUniqueActivityColors([...byName.values()])) {
    const visual = visualForType(item.name, item.color);
    visuals.set(visual.key, visual);
  }
  const used = new Set([...visuals.values()].map(item => item.accent));
  const extraNames = new Map(reservations.map(item => [normalizeActivityType(item.tipoActividad), item.tipoActividad || 'OTROS']));
  for (const [key, name] of [...extraNames.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (visuals.has(key)) continue;
    const color = getAvailableActivityColor(used, colorFromName(key), key);
    used.add(color);
    visuals.set(key, visualForType(name, color));
  }
  return {
    legend: [...visuals.values()],
    getReservationTypeVisual(reservation: Pick<Reservation, 'tipoActividad'>): ReservationTypeVisual {
      const key = normalizeActivityType(reservation.tipoActividad);
      return visuals.get(key) ?? visualForType(key, getAvailableActivityColor(used, colorFromName(key), key));
    },
  };
}

const defaultRegistry = createReservationVisualRegistry();
export const RESERVATION_TYPE_LEGEND = defaultRegistry.legend;
export function getReservationTypeVisual(reservation: Pick<Reservation, 'tipoActividad' | 'descripcion'>): ReservationTypeVisual {
  return defaultRegistry.getReservationTypeVisual(reservation);
}

/** Formats visible reservation text without changing stored or editable values. */
export function formatDisplayTitle(raw?: string): string {
  return (raw || '').trim().normalize('NFC').toLocaleLowerCase('es-CL')
    .replace(/(^|[^\p{L}\p{M}])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toLocaleUpperCase('es-CL'));
}
