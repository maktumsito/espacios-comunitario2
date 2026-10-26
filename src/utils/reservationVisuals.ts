import type { ActivityTypeItem, Reservation } from '../types';
import { ACTIVITY_COLOR_PALETTE, DEFAULT_ACTIVITY_ITEMS, LEGACY_ACTIVITY_COLORS } from '../data/activityTypes';

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
  // Saturated HSL keeps generated types as vivid as the built-in palette.
  const hue = (hash % 3600) / 600;
  const saturation = 0.76 + ((hash >>> 12) % 20) / 100;
  const lightness = 0.44 + ((hash >>> 24) % 12) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
  const channels = hue < 1 ? [chroma, secondary, 0] : hue < 2 ? [secondary, chroma, 0]
    : hue < 3 ? [0, chroma, secondary] : hue < 4 ? [0, secondary, chroma]
    : hue < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return '#' + channels.map(channel => Math.round((channel + lightness - chroma / 2) * 255)
    .toString(16).padStart(2, '0')).join('');
}

export function getAvailableActivityColor(
  colors: Iterable<string>, preferred?: string, name = 'ACTIVIDAD'
): string {
  const used = new Set([...colors].map(normalizeColor));
  used.add(CONFLICT_COLOR);
  const requested = normalizeColor(preferred);
  if (requested && !used.has(requested)) return requested;
  const available = ACTIVITY_COLOR_PALETTE.find(color => !used.has(color));
  if (available) return available;
  for (let attempt = 0; ; attempt++) {
    const generated = colorFromName(name, attempt);
    if (!used.has(generated)) return generated;
  }
}

/** Repair duplicate/invalid colors while preserving every other configured color. */
export function assignUniqueActivityColors(items: readonly ActivityTypeItem[]): ActivityTypeItem[] {
  const refreshed = items.map(item => {
    const defaultType = DEFAULT_ACTIVITY_ITEMS.find(type => type.id === item.id
      && normalizeActivityType(type.name) === normalizeActivityType(item.name));
    return defaultType && normalizeColor(item.color) === LEGACY_ACTIVITY_COLORS[item.id]
      ? { ...item, color: defaultType.color } : item;
  });
  const used = new Set([CONFLICT_COLOR]);
  const colors = refreshed.map(item => {
    const color = normalizeColor(item.color);
    if (!color || used.has(color)) return undefined;
    used.add(color);
    return color;
  });
  return refreshed.map((item, index) => {
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
    background: tint(color, 0.82), border: tint(color, 0.35),
  };
}

export function getActivityColorText(color: string): string {
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const darkLuminance = 0.0088; // Slate 900 text.
  return (luminance + 0.05) / (darkLuminance + 0.05) > 1.05 / (luminance + 0.05)
    ? '#0f172a' : '#ffffff';
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
