import { describe, expect, it } from 'vitest';
import type { ActivityTypeItem } from '../../types';
import { DEFAULT_ACTIVITY_ITEMS } from '../../data/activityTypes';
import {
  assignUniqueActivityColors, createReservationVisualRegistry, getActivityColorText,
  getAvailableActivityColor, getReservationTypeVisual,
} from '../reservationVisuals';

const activity = (name: string, color: string): ActivityTypeItem => ({ id: name, name, color, category: 'General' });

describe('automatic reservation colors by exact activity type', () => {
  it('gives every built-in type a distinct color matching the catalogue', () => {
    const colors = DEFAULT_ACTIVITY_ITEMS.map(item => getReservationTypeVisual({ tipoActividad: item.name, descripcion: '' }).accent);
    expect(new Set(colors).size).toBe(DEFAULT_ACTIVITY_ITEMS.length);
    expect(colors).toEqual(DEFAULT_ACTIVITY_ITEMS.map(item => item.color));
  });

  it('keeps the same type color regardless of description, accents, spaces or casing', () => {
    const original = getReservationTypeVisual({ tipoActividad: 'PRÉSTAMO', descripcion: 'Reunión' });
    const changed = getReservationTypeVisual({ tipoActividad: '  prestamo  ', descripcion: 'Ensayo de yoga y danza' });
    expect(changed).toEqual(original);
    expect(getReservationTypeVisual({ tipoActividad: 'TALLER MUNICIPAL', descripcion: '' }).accent)
      .not.toBe(getReservationTypeVisual({ tipoActividad: 'ACTIVIDAD MUNICIPAL', descripcion: '' }).accent);
  });

  it('repairs duplicate, equivalent and invalid colors without taking another valid color', () => {
    const items = [activity('A', '#ABC'), activity('B', '#aabbcc'), activity('C', '#0284c7'), activity('D', 'invalid'), activity('E', '#e11d48')];
    const fixed = assignUniqueActivityColors(items);
    expect(fixed[0].color).toBe('#aabbcc');
    expect(fixed[2].color).toBe('#0284c7');
    expect(new Set(fixed.map(item => item.color)).size).toBe(items.length);
    expect(fixed.some(item => item.color === '#e11d48')).toBe(false);
    expect(assignUniqueActivityColors(fixed)).toEqual(fixed);
    expect(items[0].color).toBe('#ABC');
  });

  it('supports more types than the preset palette and keeps their colors on reload', () => {
    const items = Array.from({ length: 150 }, (_, index) => activity(`TIPO ${index}`, '#0284c7'));
    const fixed = assignUniqueActivityColors(items);
    expect(new Set(fixed.map(item => item.color)).size).toBe(150);
    expect(assignUniqueActivityColors(JSON.parse(JSON.stringify(fixed)))).toEqual(fixed);
    expect(getAvailableActivityColor(fixed.map(item => item.color))).not.toBe(fixed[0].color);
  });

  it('includes custom and historical types in a shared unique legend independent of reservation order', () => {
    const types = [activity('CONVENIO', '#abcdef'), activity('OTRO CONVENIO', '#abcdef')];
    const reservations = [{ tipoActividad: 'ANTIGUO' }, { tipoActividad: 'OTRO HISTÓRICO' }, { tipoActividad: 'CONVENIO' }];
    const registry = createReservationVisualRegistry(types, reservations);
    const reloaded = createReservationVisualRegistry(types, [...reservations].reverse());
    expect(new Set(registry.legend.map(item => item.accent)).size).toBe(registry.legend.length);
    for (const reservation of reservations) {
      const visual = registry.getReservationTypeVisual(reservation);
      expect(registry.legend.find(item => item.key === visual.key)).toEqual(visual);
      expect(reloaded.getReservationTypeVisual(reservation)).toEqual(visual);
    }
    expect(registry.getReservationTypeVisual({ tipoActividad: ' convenio ' }).accent).toBe('#abcdef');
  });

  it('chooses readable text for light and dark calendar colors', () => {
    expect(getActivityColorText('#ffff00')).toBe('#0f172a');
    expect(getActivityColorText('#123456')).toBe('#ffffff');
  });
});
