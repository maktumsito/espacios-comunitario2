import type { ActivityTypeItem } from '../types';

export const DEFAULT_ACTIVITY_ITEMS: ActivityTypeItem[] = [
  {
    id: 'ACT_TALLER_CCD',
    name: 'TALLER CCD',
    category: 'Formación y Desarrollo',
    color: '#2563eb',
    description: 'Talleres formativos regulares del Centro Comunitario',
    isCustom: false
  },
  {
    id: 'ACT_TALLER_MUNI',
    name: 'TALLER MUNICIPAL',
    category: 'Municipal',
    color: '#16a34a',
    description: 'Programas municipales de capacitación y deportes',
    isCustom: false
  },
  {
    id: 'ACT_TALLER_JJV',
    name: 'TALLER JJV',
    category: 'Vecinal',
    color: '#9333ea',
    description: 'Talleres autogestionados por Juntas de Vecinos',
    isCustom: false
  },
  {
    id: 'ACT_ENSAYO',
    name: 'ENSAYO',
    category: 'Cultura y Artes',
    color: '#f97316',
    description: 'Ensayos de danza, música, teatro y folklore',
    isCustom: false
  },
  {
    id: 'ACT_CHARLA',
    name: 'CHARLA',
    category: 'Educación y Salud',
    color: '#06b6d4',
    description: 'Exposiciones informativas, asambleas y conversatorios',
    isCustom: false
  },
  {
    id: 'ACT_MUNICIPAL',
    name: 'ACTIVIDAD MUNICIPAL',
    category: 'Institucional',
    color: '#ef4444',
    description: 'Atenciones ciudadanas, operativos de salud y ceremonias',
    isCustom: false
  },
  {
    id: 'ACT_PRESTAMO',
    name: 'PRÉSTAMO',
    category: 'Uso Comunitario',
    color: '#ec4899',
    description: 'Uso temporal otorgado para reuniones o actividades grupales',
    isCustom: false
  },
  {
    id: 'ACT_CUMPLE',
    name: 'CUMPLEAÑOS',
    category: 'Social y Familiar',
    color: '#facc15',
    description: 'Celebraciones familiares o comunitarias autorizadas',
    isCustom: false
  },
  {
    id: 'ACT_OTROS',
    name: 'OTROS',
    category: 'General',
    color: '#84cc16',
    description: 'Otras actividades y usos diversos',
    isCustom: false
  }
];

// Existing installations may still have the previous built-in palette cached or in Firestore.
export const LEGACY_ACTIVITY_COLORS: Record<string, string> = {
  ACT_TALLER_CCD: '#0284c7', ACT_TALLER_MUNI: '#059669', ACT_TALLER_JJV: '#7c3aed',
  ACT_ENSAYO: '#ea580c', ACT_CHARLA: '#4f46e5', ACT_MUNICIPAL: '#0891b2',
  ACT_PRESTAMO: '#2563eb', ACT_CUMPLE: '#d97706', ACT_OTROS: '#64748b',
};

export const ACTIVITY_COLOR_PALETTE = [
  ...DEFAULT_ACTIVITY_ITEMS.map(item => item.color),
  '#6366f1', '#14b8a6', '#d946ef', '#f59e0b', '#0ea5e9', '#e879f9',
  '#fb7185', '#22c55e', '#a855f7',
];
