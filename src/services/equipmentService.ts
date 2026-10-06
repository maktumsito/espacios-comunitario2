import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import { EquipmentItem, Reservation } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { isTimeOverlapping, isDateExemptFromConflicts, getTimeIntervalsForReservation, isReservationActiveForAvailability } from '../utils/conflictDetector';

const EQUIPMENT_STORAGE_KEY = 'espacios_comunitarios_equipment_v1';
const CONFIG_COLLECTION = 'configuracion_sistema';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export const DEFAULT_EQUIPMENT_ITEMS: EquipmentItem[] = [
  {
    id: 'EQ_PROYECTOR_HD',
    name: 'Proyector / Data Show HD',
    category: 'Audiovisual',
    totalQuantity: 3,
    iconName: 'Video',
    description: 'Proyector portátil Full HD con entradas HDMI y VGA para presentaciones.',
    isCustom: false
  },
  {
    id: 'EQ_TELON_MOVIL',
    name: 'Telón de Proyección Trípode',
    category: 'Audiovisual',
    totalQuantity: 2,
    iconName: 'Presentation',
    description: 'Telón enrollable de 100 pulgadas con trípode ajustable.',
    isCustom: false
  },
  {
    id: 'EQ_MICRO_INALAMBRICO',
    name: 'Micrófono Inalámbrico de Mano',
    category: 'Audio',
    totalQuantity: 4,
    iconName: 'Mic',
    description: 'Micrófono UHF de largo alcance con pilas recargables.',
    isCustom: false
  },
  {
    id: 'EQ_MICRO_SOLAPERO',
    name: 'Micrófono Solapero / Cintillo',
    category: 'Audio',
    totalQuantity: 2,
    iconName: 'Radio',
    description: 'Micrófono bodypack inalámbrico para profesores de danza y relatores.',
    isCustom: false
  },
  {
    id: 'EQ_PARLANTE_PORTATIL',
    name: 'Parlante Activo Portátil Bluetooth',
    category: 'Audio',
    totalQuantity: 3,
    iconName: 'Speaker',
    description: 'Caja activa de sonido con batería recargable, Bluetooth y entrada auxiliar.',
    isCustom: false
  },
  {
    id: 'EQ_NOTEBOOK_PRESENTACION',
    name: 'Notebook para Presentaciones',
    category: 'Informática',
    totalQuantity: 2,
    iconName: 'Laptop',
    description: 'Notebook de recepción con software de oficina, navegador y salidas de video.',
    isCustom: false
  },
  {
    id: 'EQ_PUNTERO_LASER',
    name: 'Puntero Láser con Pasador',
    category: 'Informática',
    totalQuantity: 3,
    iconName: 'Zap',
    description: 'Control remoto inalámbrico USB para diapositivas y puntero rojo.',
    isCustom: false
  },
  {
    id: 'EQ_MESAS_PLEGABLES',
    name: 'Mesas Plegables Rectangulares',
    category: 'Mobiliario',
    totalQuantity: 15,
    iconName: 'Grid',
    description: 'Mesas tipo banqueteras de 1.80m de largo para talleres y exposiciones.',
    isCustom: false
  },
  {
    id: 'EQ_SILLAS_PLEGABLES',
    name: 'Sillas Plegables Acolchadas',
    category: 'Mobiliario',
    totalQuantity: 60,
    iconName: 'Armchair',
    description: 'Sillas metálicas plegables para eventos, asambleas y reuniones.',
    isCustom: false
  },
  {
    id: 'EQ_PIZARRA_MOVIL',
    name: 'Pizarra Acrílica Móvil + Plumones',
    category: 'Audiovisual',
    totalQuantity: 3,
    iconName: 'FileText',
    description: 'Pizarra blanca de doble cara con ruedas y kit de plumones con borrador.',
    isCustom: false
  },
  {
    id: 'EQ_COLCHONETAS',
    name: 'Set de Colchonetas Deportivas',
    category: 'Deportes',
    totalQuantity: 20,
    iconName: 'Layers',
    description: 'Colchonetas de gimnasia de alta densidad para yoga, pilates y acondicionamiento.',
    isCustom: false
  },
  {
    id: 'EQ_ZAPATILLAS_ELECTRICAS',
    name: 'Alargue / Zapatilla Eléctrica 10m',
    category: 'Otros',
    totalQuantity: 6,
    iconName: 'Plug',
    description: 'Extensiones eléctricas reforzadas con protección de sobrecarga.',
    isCustom: false
  }
];

export function getStoredEquipment(): EquipmentItem[] {
  if (!isBrowser) return DEFAULT_EQUIPMENT_ITEMS;
  try {
    const raw = localStorage.getItem(EQUIPMENT_STORAGE_KEY);
    if (!raw) return DEFAULT_EQUIPMENT_ITEMS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Error reading equipment from localStorage:', e);
  }
  return DEFAULT_EQUIPMENT_ITEMS;
}

export async function saveEquipmentItem(item: EquipmentItem): Promise<EquipmentItem[]> {
  const current = getStoredEquipment();
  const index = current.findIndex(e => e.id === item.id);
  let updated: EquipmentItem[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...item, isCustom: true };
  } else {
    updated = [...current, { ...item, isCustom: true }];
  }
  await saveEquipmentDocToFirestore(updated);
  try {
    if (isBrowser) {
      localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('app_equipment_changed', { detail: updated }));
    }
  } catch (e) {
    console.error('Error saving equipment to localStorage:', e);
  }
  return updated;
}

export async function deleteEquipmentItem(id: string): Promise<EquipmentItem[]> {
  const current = getStoredEquipment();
  const updated = current.filter(e => e.id !== id);
  await saveEquipmentDocToFirestore(updated);
  try {
    if (isBrowser) {
      localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('app_equipment_changed', { detail: updated }));
    }
  } catch (e) {
    console.error('Error deleting equipment from localStorage:', e);
  }
  return updated;
}

export async function resetEquipmentToDefaults(): Promise<EquipmentItem[]> {
  await saveEquipmentDocToFirestore(DEFAULT_EQUIPMENT_ITEMS);
  if (isBrowser) {
    localStorage.removeItem(EQUIPMENT_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('app_equipment_changed', { detail: DEFAULT_EQUIPMENT_ITEMS }));
  }
  return DEFAULT_EQUIPMENT_ITEMS;
}

export function subscribeToEquipment(
  callback: (items: EquipmentItem[]) => void
): () => void {
  const db = getDb();
  if (!db) {
    callback(getStoredEquipment());
    return () => {};
  }
  try {
    const docRef = doc(db, CONFIG_COLLECTION, 'equipamiento');
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data.items) && data.items.length > 0) {
            try {
              localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(data.items));
            } catch (e) {
              console.warn(e);
            }
            callback(data.items);
            return;
          }
        }
        callback(getStoredEquipment());
      },
      (error) => {
        console.warn('Equipment snapshot warning:', error);
        callback(getStoredEquipment());
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn('Error subscribing to equipment:', err);
    callback(getStoredEquipment());
    return () => {};
  }
}

async function saveEquipmentDocToFirestore(items: EquipmentItem[]) {
  const db = getDb();
  if (!db) throw new Error("No hay conexión con la base de datos.");
  try {
    const docRef = doc(db, CONFIG_COLLECTION, 'equipamiento');
    await setDoc(docRef, { items, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    throw err;
  }
}

/**
 * Calculates current usage and remaining available quantity for each equipment item
 * on a given date and time range [startMin, endMin].
 */
export function calculateEquipmentAvailability(
  date: string,
  startMin: number,
  endMin: number,
  allReservations: readonly Reservation[],
  equipmentList: EquipmentItem[],
  excludeReservationId?: string | string[],
  excludeSeriesId?: string
): Array<{
  item: EquipmentItem;
  totalQuantity: number;
  usedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
  occupyingReservations: {
    reservationId: string;
    espacio: string;
    responsable: string;
    tipoActividad: string;
    horaInicio: string;
    horaFin: string;
    quantity: number;
  }[];
}> {
  const targetDate = date ? date.trim() : '';

  const excludeIdSet = new Set<string>();
  if (Array.isArray(excludeReservationId)) {
    excludeReservationId.forEach((id) => id && excludeIdSet.add(id));
  } else if (excludeReservationId) {
    excludeIdSet.add(excludeReservationId);
  }

  const targetDay=Date.parse(`${targetDate}T12:00:00Z`);
  const previousDate=Number.isFinite(targetDay) ? new Date(targetDay-86400000).toISOString().slice(0,10) : '';
  const occupying=targetDate && Number.isFinite(targetDay) && !isDateExemptFromConflicts(targetDate) ? allReservations.filter(r=>{
    const date=(r.fecha||'').trim();
    return date>=previousDate && date<=targetDate && !excludeIdSet.has(r.id) &&
      !(excludeSeriesId && (r.serieRecurrente===excludeSeriesId||r.recurrenteId===excludeSeriesId)) &&
      !isDateExemptFromConflicts(date) && isReservationActiveForAvailability(r) &&
      getTimeIntervalsForReservation(r).some(slot=>slot.date===targetDate && isTimeOverlapping(startMin,endMin,slot.startMin,slot.endMin));
  }) : [];
  return equipmentList.map((eq) => {
    let usedQuantity = 0;
    const occupyingReservations: {
      reservationId: string;
      espacio: string;
      responsable: string;
      tipoActividad: string;
      horaInicio: string;
      horaFin: string;
      quantity: number;
    }[] = [];

    for (const r of occupying) {
      const req=r.equipamientoSolicitado?.find(e=>e.equipmentId===eq.id || e.equipmentName?.toLowerCase()===eq.name.toLowerCase());
      if (req && Number(req.quantity)>0) {
        const quantity=Number(req.quantity);
        usedQuantity+=quantity;
        occupyingReservations.push({reservationId:r.id,espacio:r.espacio,responsable:r.responsable,
          tipoActividad:r.tipoActividad||r.descripcion,horaInicio:r.horaInicio,horaFin:r.horaFin,quantity});
      }
    }

    const availableQuantity = Math.max(0, eq.totalQuantity - usedQuantity);

    return {
      item: eq,
      totalQuantity: eq.totalQuantity,
      usedQuantity,
      availableQuantity,
      isAvailable: availableQuantity > 0,
      occupyingReservations
    };
  });
}
