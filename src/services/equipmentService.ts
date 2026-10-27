import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import { EquipmentItem, Reservation } from '../types';
import { doc, setDoc } from '../firebase/gateway';
import { getDb } from '../firebase/config';
import { isTimeOverlapping, isDateExemptFromConflicts, getTimeIntervalsForReservation, isReservationActiveForAvailability } from '../utils/conflictDetector';

const EQUIPMENT_STORAGE_KEY = 'espacios_comunitarios_equipment_v1';
const CONFIG_COLLECTION = 'configuracion_sistema';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export { DEFAULT_EQUIPMENT_ITEMS } from '../data/equipmentData';
import { DEFAULT_EQUIPMENT_ITEMS } from '../data/equipmentData';

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
