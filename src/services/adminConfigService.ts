import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import { SpaceInfo, LoanType, ActivityTypeItem } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { getDb } from '../firebase/config';

const SPACES_STORAGE_KEY = 'espacios_comunitarios_spaces_v2';
const LOANS_STORAGE_KEY = 'espacios_comunitarios_loans_v2';
const ACTIVITIES_STORAGE_KEY = 'espacios_comunitarios_activities_v2';
const CONFIG_COLLECTION = 'configuracion_sistema';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export const DEFAULT_LOAN_TYPES: LoanType[] = [
  {
    id: 'TALLER_REGULAR',
    name: 'TALLER FORMATIVO CCD',
    category: 'Formativo',
    description: 'Talleres sistemáticos impartidos periódicamente con lista de inscritos y asistencia regular.',
    color: '#059669',
    defaultDurationMinutes: 90,
    isCustom: false
  },
  {
    id: 'TALLER_MUNICIPAL',
    name: 'TALLER MUNICIPAL',
    category: 'Municipal',
    description: 'Cursos y programas organizados directamente por dependencias o corporaciones municipales.',
    color: '#0891b2',
    defaultDurationMinutes: 90,
    isCustom: false
  },
  {
    id: 'ENSAYO_ARTISTICO',
    name: 'ENSAYO ARTÍSTICO / CULTURAL',
    category: 'Cultural',
    description: 'Prácticas de elencos de danza, folklore, bandas musicales, grupos corales o compañías de teatro.',
    color: '#d97706',
    defaultDurationMinutes: 120,
    isCustom: false
  },
  {
    id: 'USO_DEPORTIVO',
    name: 'USO DEPORTIVO / RECREATIVO',
    category: 'Deportes',
    description: 'Préstamo de multicanchas o gimnasio para entrenamientos de clubes y partidos recreativos.',
    color: '#0284c7',
    defaultDurationMinutes: 60,
    isCustom: false
  },
  {
    id: 'PRESTAMO_INSTITUCIONAL',
    name: 'PRÉSTAMO INSTITUCIONAL',
    category: 'Institucional',
    description: 'Uso otorgado a servicios públicos, CESFAM, escuelas, universidades, delegaciones o ministerios.',
    color: '#7c3aed',
    defaultDurationMinutes: 180,
    isCustom: false
  },
  {
    id: 'PRESTAMO_COMUNITARIO',
    name: 'PRÉSTAMO COMUNITARIO',
    category: 'Comunitario',
    description: 'Solicitado por organizaciones vecinales, clubes de adulto mayor, comités de adelanto o agrupaciones barriales.',
    color: '#2563eb',
    defaultDurationMinutes: 120,
    isCustom: false
  },
  {
    id: 'EVENTO_CELEBRACION',
    name: 'EVENTO / CELEBRACIÓN COMUNITARIA',
    category: 'Social',
    description: 'Actividades masivas, aniversarios, cumpleaños comunitarios, ferias barriales o bingos solidarios.',
    color: '#dc2626',
    defaultDurationMinutes: 240,
    isCustom: false
  }
];

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

// Helper to push config to Firestore
async function saveConfigDocToFirestore(docId: string, data: any): Promise<void> {
  try {
    const db = getDb();
    await setDoc(doc(db, CONFIG_COLLECTION, docId), { data, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    throw err;
  }
}

/**
 * Subscribes to real-time admin configurations (spaces, loan types, activity types)
 * using Stale-While-Revalidate:
 * 1. Synchronously serves cached config immediately.
 * 2. Silently updates with latest data from Firestore.
 */
export function subscribeToAdminConfig(
  onUpdate: (config: { spaces?: SpaceInfo[]; loanTypes?: LoanType[]; activityTypes?: ActivityTypeItem[] }) => void
): () => void {
  // 1. [STALE] Emit cached config immediately
  onUpdate({
    spaces: getStoredSpaces(),
    loanTypes: getStoredLoanTypes(),
    activityTypes: getStoredActivityTypes()
  });

  try {
    const db = getDb();
    const colRef = collection(db, CONFIG_COLLECTION);

    // 2. [REVALIDATE] Silently update from Firestore
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        if (snapshot.empty) {
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          // Seed defaults to Firestore so all devices have shared configuration
          const spaces = getStoredSpaces();
          const loans = getStoredLoanTypes();
          const activities = getStoredActivityTypes();
          void saveConfigDocToFirestore('espacios', spaces).catch(console.error);
          void saveConfigDocToFirestore('tipos_prestamo', loans).catch(console.error);
          void saveConfigDocToFirestore('tipos_actividad', activities).catch(console.error);
          return;
        }

        snapshot.docs.forEach((docSnap) => {
          const docId = docSnap.id;
          const payload = docSnap.data();
          if (docId === 'espacios' && Array.isArray(payload.data)) {
            if (isBrowser) localStorage.setItem(SPACES_STORAGE_KEY, JSON.stringify(payload.data));
            onUpdate({ spaces: payload.data });
          } else if (docId === 'tipos_prestamo' && Array.isArray(payload.data)) {
            if (isBrowser) localStorage.setItem(LOANS_STORAGE_KEY, JSON.stringify(payload.data));
            onUpdate({ loanTypes: payload.data });
          } else if (docId === 'tipos_actividad' && Array.isArray(payload.data)) {
            if (isBrowser) localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(payload.data));
            onUpdate({ activityTypes: payload.data });
          }
        });
      },
      (err) => {
        console.warn('Admin config subscription fallback:', err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Error starting admin config subscription:', err);
    return () => {};
  }
}

// --- SPACES MANAGEMENT ---
export function getStoredSpaces(): SpaceInfo[] {
  if (!isBrowser) return SPACES_LIST;
  try {
    const raw = localStorage.getItem(SPACES_STORAGE_KEY);
    if (!raw) return SPACES_LIST;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Error reading spaces from localStorage:', e);
  }
  return SPACES_LIST;
}

export async function saveSpaceItem(space: SpaceInfo ): Promise<SpaceInfo[]> {
  const current = getStoredSpaces();
  const index = current.findIndex(s => s.id === space.id || s.name.toUpperCase() === space.name.toUpperCase());
  let updated: SpaceInfo[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...space, isCustom: true };
  } else {
    updated = [...current, { ...space, isCustom: true }];
  }
  await saveConfigDocToFirestore('espacios', updated);
  try {
    if (isBrowser) localStorage.setItem(SPACES_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving space to localStorage:', e);
  }
  return updated;
}

export async function deleteSpaceItem(id: string ): Promise<SpaceInfo[]> {
  const current = getStoredSpaces();
  const updated = current.filter(s => s.id !== id);
  await saveConfigDocToFirestore('espacios', updated);
  try {
    if (isBrowser) localStorage.setItem(SPACES_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting space from localStorage:', e);
  }
  return updated;
}

export async function reorderSpaces(newSpaces: SpaceInfo[] ): Promise<SpaceInfo[]> {
  await saveConfigDocToFirestore('espacios', newSpaces);
  try {
    if (isBrowser) localStorage.setItem(SPACES_STORAGE_KEY, JSON.stringify(newSpaces));
  } catch (e) {
    console.error('Error reordering spaces in localStorage:', e);
  }
  return newSpaces;
}

// --- LOAN TYPES MANAGEMENT ---
export function getStoredLoanTypes(): LoanType[] {
  if (!isBrowser) return DEFAULT_LOAN_TYPES;
  try {
    const raw = localStorage.getItem(LOANS_STORAGE_KEY);
    if (!raw) return DEFAULT_LOAN_TYPES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Error reading loan types from localStorage:', e);
  }
  return DEFAULT_LOAN_TYPES;
}

export async function saveLoanTypeItem(loan: LoanType ): Promise<LoanType[]> {
  const current = getStoredLoanTypes();
  const index = current.findIndex(l => l.id === loan.id || l.name.toUpperCase() === loan.name.toUpperCase());
  let updated: LoanType[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...loan, isCustom: true };
  } else {
    updated = [...current, { ...loan, isCustom: true }];
  }
  await saveConfigDocToFirestore('tipos_prestamo', updated);
  try {
    if (isBrowser) localStorage.setItem(LOANS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving loan type to localStorage:', e);
  }
  return updated;
}

export async function deleteLoanTypeItem(id: string ): Promise<LoanType[]> {
  const current = getStoredLoanTypes();
  const updated = current.filter(l => l.id !== id);
  await saveConfigDocToFirestore('tipos_prestamo', updated);
  try {
    if (isBrowser) localStorage.setItem(LOANS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting loan type from localStorage:', e);
  }
  return updated;
}

// --- ACTIVITY TYPES MANAGEMENT ---
export function getStoredActivityTypes(): ActivityTypeItem[] {
  if (!isBrowser) return DEFAULT_ACTIVITY_ITEMS;
  try {
    const raw = localStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (!raw) return DEFAULT_ACTIVITY_ITEMS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Error reading activity types from localStorage:', e);
  }
  return DEFAULT_ACTIVITY_ITEMS;
}

export async function saveActivityTypeItem(act: ActivityTypeItem ): Promise<ActivityTypeItem[]> {
  const current = getStoredActivityTypes();
  const index = current.findIndex(a => a.id === act.id || a.name.toUpperCase() === act.name.toUpperCase());
  let updated: ActivityTypeItem[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...act, isCustom: true };
  } else {
    updated = [...current, { ...act, isCustom: true }];
  }
  await saveConfigDocToFirestore('tipos_actividad', updated);
  try {
    if (isBrowser) localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving activity type to localStorage:', e);
  }
  return updated;
}

export async function deleteActivityTypeItem(id: string ): Promise<ActivityTypeItem[]> {
  const current = getStoredActivityTypes();
  const updated = current.filter(a => a.id !== id);
  await saveConfigDocToFirestore('tipos_actividad', updated);
  try {
    if (isBrowser) localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting activity type from localStorage:', e);
  }
  return updated;
}

export async function resetConfigToDefaults(): Promise<void> {
  // All configuration documents commit together.
  const db = getDb();
  const batch = writeBatch(db);
  for (const [id, data] of [['espacios', SPACES_LIST], ['tipos_prestamo', DEFAULT_LOAN_TYPES], ['tipos_actividad', DEFAULT_ACTIVITY_ITEMS]] as const) {
    batch.set(doc(db, CONFIG_COLLECTION, id), { data, updatedAt: new Date().toISOString() });
  }
  await batch.commit();
  if (isBrowser) {
    localStorage.removeItem(SPACES_STORAGE_KEY);
    localStorage.removeItem(LOANS_STORAGE_KEY);
    localStorage.removeItem(ACTIVITIES_STORAGE_KEY);
  }
}
