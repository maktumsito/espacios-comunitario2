import { SpaceInfo } from '../types';

export const SPACES_LIST: SpaceInfo[] = [
  {
    id: 'AUDITORIO',
    name: 'AUDITORIO',
    capacity: 150,
    category: 'Eventos',
    iconName: 'Presentation',
    color: '#c026d3', // fuchsia
    description: 'Auditorio principal con escenario y equipo audiovisual para asambleas, ceremonias y charlas.'
  },
  {
    id: 'GIMNASIO',
    name: 'GIMNASIO',
    capacity: 70,
    category: 'Deportes',
    iconName: 'Dumbbell',
    color: '#059669', // emerald
    description: 'Gimnasio multiuso para acondicionamiento físico, zumba masiva, teatro y actividades deportivas.'
  },
  {
    id: 'SALA DE ESPEJOS',
    name: 'SALA DE ESPEJOS',
    capacity: 35,
    category: 'Eventos',
    iconName: 'Sparkles',
    color: '#7c3aed', // violet
    description: 'Sala amplia con espejos y piso flotante para danza moderna, ballet, zumba, folklore y ensayos.'
  },
  {
    id: 'TATAMI',
    name: 'TATAMI',
    capacity: 25,
    category: 'Deportes',
    iconName: 'Activity',
    color: '#0284c7', // sky
    description: 'Área acolchada para artes marciales, yoga, pilates, entrenamiento funcional y disciplinas de suelo.'
  },
  {
    id: 'SALA 2',
    name: 'SALA 2',
    capacity: 20,
    category: 'Salas de Clases',
    iconName: 'Layers',
    color: '#0891b2', // cyan
    description: 'Sala multiuso para estimulación sensorial, habilidades cognitivas, amigurumi y manicure.'
  },
  {
    id: 'SALA 3',
    name: 'SALA 3',
    capacity: 30,
    category: 'Salas de Clases',
    iconName: 'BookOpen',
    color: '#4f46e5', // indigo
    description: 'Espacio para Clubes de Adulto Mayor (CAM), talleres textiles, guitarra y grupos culturales.'
  },
  {
    id: 'SALA 4',
    name: 'SALA 4',
    capacity: 20,
    category: 'Salas de Clases',
    iconName: 'Grid',
    color: '#d97706', // amber
    description: 'Sala de actividades cognitivas infantiles, estimulación temprana, manualidades y punto cruz.'
  },
  {
    id: 'SALA 5',
    name: 'SALA 5',
    capacity: 15,
    category: 'Salas de Clases',
    iconName: 'GraduationCap',
    color: '#0d9488', // teal
    description: 'Sala para apoyo escolar, alfabetización, inglés y talleres comunitarios.'
  },
  {
    id: 'SALA 6',
    name: 'SALA 6',
    capacity: 70,
    category: 'Salas de Clases',
    iconName: 'Users',
    color: '#64748b', // slate
    description: 'Sala comunitaria para desarrollo integral, ergoterapia, reuniones vecinales y celebraciones.'
  },
  {
    id: 'BIBLIOTECA',
    name: 'BIBLIOTECA',
    capacity: 20,
    category: 'Salas de Clases',
    iconName: 'Library',
    color: '#ca8a04', // yellow-gold
    description: 'Espacio de estudio silencioso, apoyo escolar, guitarra avanzada y círculos de lectura.'
  },
  {
    id: 'PATIO EXTERIOR',
    name: 'PATIO EXTERIOR',
    capacity: 60,
    category: 'Exterior',
    iconName: 'Sun',
    color: '#65a30d', // lime
    description: 'Patio al aire libre para patinaje infantil, dinámicas sensoriales y recreación.'
  },
  {
    id: 'COCINA',
    name: 'COCINA',
    capacity: 15,
    category: 'Especiales',
    iconName: 'ChefHat',
    color: '#ea580c', // orange
    description: 'Cocina comunitaria equipada para repostería, pastelería y talleres gastronómicos infantiles y de adultos.'
  },
  {
    id: 'MULTICANCHA',
    name: 'MULTICANCHA',
    capacity: 80,
    category: 'Deportes',
    iconName: 'Trophy',
    color: '#2563eb', // blue
    description: 'Cancha deportiva exterior para fútbol infantil, fútbol femenino, vóleibol y básquetbol.'
  },
  {
    id: 'BOX 1',
    name: 'BOX 1',
    capacity: 8,
    category: 'Especiales',
    iconName: 'Stethoscope',
    color: '#dc2626', // red
    description: 'Box de atención personalizada, evaluaciones cognitivas y apoyo escolar individual.'
  }
];

export const ACTIVITY_TYPES = [
  'TALLER CCD',
  'TALLER MUNICIPAL',
  'TALLER JJV',
  'PRÉSTAMO',
  'ENSAYO',
  'CUMPLEAÑOS',
  'ACTIVIDAD MUNICIPAL',
  'CHARLA',
  'OTROS'
];

/**
 * Normalizes space names to ensure consistent mapping across all views and Firestore records
 */
export function normalizeSpaceName(name?: string): string {
  if (!name) return 'TATAMI';
  const clean = name.trim().toUpperCase().replace(/\s+/g, ' ');
  if (clean === 'BOX1' || clean === 'BOX-1') return 'BOX 1';
  if (clean === 'SALA2' || clean === 'SALA-2') return 'SALA 2';
  if (clean === 'SALA3' || clean === 'SALA-3') return 'SALA 3';
  if (clean === 'SALA4' || clean === 'SALA-4') return 'SALA 4';
  if (clean === 'SALA5' || clean === 'SALA-5') return 'SALA 5';
  if (clean === 'SALA6' || clean === 'SALA-6') return 'SALA 6';
  if (clean === 'SALA ESPEJOS' || clean === 'ESPEJOS' || clean === 'SALA DE ESPEJO') return 'SALA DE ESPEJOS';
  if (clean === 'PATIO' || clean === 'EXTERIOR' || clean === 'PATIO EXTERNO') return 'PATIO EXTERIOR';
  if (clean === 'CANCHA' || clean === 'MULTICANCA') return 'MULTICANCHA';
  return clean;
}

/**
 * Returns the configured color for a space name from SPACES_LIST, defaulting to slate-500 (#64748b).
 */
export function getSpaceColor(spaceName: string): string {
  const found = SPACES_LIST.find((s) => s.name.toUpperCase() === spaceName.toUpperCase());
  return found ? found.color : '#64748b';
}

