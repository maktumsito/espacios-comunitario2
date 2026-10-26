import type { ActivityTypeItem } from '../types';

export const DEFAULT_ACTIVITY_ITEMS: ActivityTypeItem[] = [
  {
    id: 'ACT_TALLER_CCD',
    name: 'TALLER CCD',
    category: 'Formación y Desarrollo',
    color: '#0284c7',
    description: 'Talleres formativos regulares del Centro Comunitario',
    isCustom: false
  },
  {
    id: 'ACT_TALLER_MUNI',
    name: 'TALLER MUNICIPAL',
    category: 'Municipal',
    color: '#059669',
    description: 'Programas municipales de capacitación y deportes',
    isCustom: false
  },
  {
    id: 'ACT_TALLER_JJV',
    name: 'TALLER JJV',
    category: 'Vecinal',
    color: '#7c3aed',
    description: 'Talleres autogestionados por Juntas de Vecinos',
    isCustom: false
  },
  {
    id: 'ACT_ENSAYO',
    name: 'ENSAYO',
    category: 'Cultura y Artes',
    color: '#ea580c',
    description: 'Ensayos de danza, música, teatro y folklore',
    isCustom: false
  },
  {
    id: 'ACT_CHARLA',
    name: 'CHARLA',
    category: 'Educación y Salud',
    color: '#4f46e5',
    description: 'Exposiciones informativas, asambleas y conversatorios',
    isCustom: false
  },
  {
    id: 'ACT_MUNICIPAL',
    name: 'ACTIVIDAD MUNICIPAL',
    category: 'Institucional',
    color: '#0891b2',
    description: 'Atenciones ciudadanas, operativos de salud y ceremonias',
    isCustom: false
  },
  {
    id: 'ACT_PRESTAMO',
    name: 'PRÉSTAMO',
    category: 'Uso Comunitario',
    color: '#2563eb',
    description: 'Uso temporal otorgado para reuniones o actividades grupales',
    isCustom: false
  },
  {
    id: 'ACT_CUMPLE',
    name: 'CUMPLEAÑOS',
    category: 'Social y Familiar',
    color: '#d97706',
    description: 'Celebraciones familiares o comunitarias autorizadas',
    isCustom: false
  },
  {
    id: 'ACT_OTROS',
    name: 'OTROS',
    category: 'General',
    color: '#64748b',
    description: 'Otras actividades y usos diversos',
    isCustom: false
  }
];
