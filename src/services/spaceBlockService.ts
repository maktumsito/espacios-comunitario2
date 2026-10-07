import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  Unsubscribe
} from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { SpaceBlock } from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { timeToMinutes } from '../utils/conflictDetector';

const COLLECTION_NAME = 'bloqueos_espacios';
const LOCAL_STORAGE_KEY = 'ccd_bloqueos_espacios_cache_v1';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/**
 * In-memory and local cache for space blocks
 */
let cachedBlocks: SpaceBlock[] = [];

export function getLocalCachedBlocks(): SpaceBlock[] {
  if (cachedBlocks.length > 0) return cachedBlocks;
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedBlocks = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error leyendo caché local de bloqueos:', err);
  }
  return [];
}

export function setLocalCachedBlocks(blocks: SpaceBlock[]): void {
  cachedBlocks = blocks;
  if (!isBrowser) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(blocks));
  } catch (err) {
    console.warn('Error guardando caché local de bloqueos:', err);
  }
}

/**
 * Subscribe to all space blocks in real time from Firestore
 */
export function subscribeToSpaceBlocks(
  onUpdate: (blocks: SpaceBlock[]) => void,
  onError?: (err: any) => void,
  startDate?: string,
): Unsubscribe {
  // Emit initial local cache immediately
  const initial = getLocalCachedBlocks().filter(block => !startDate || block.fechaFin >= startDate);
  onUpdate(initial);

  const db = getDb();
  if (!db) {
    return () => {};
  }

  const collRef = startDate
    ? query(collection(db, COLLECTION_NAME), where('fechaFin', '>=', startDate))
    : collection(db, COLLECTION_NAME);
  return onSnapshot(
    collRef,
    (snapshot) => {
      const list: SpaceBlock[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as SpaceBlock;
        list.push({
          ...data,
          id: d.id
        });
      });
      setLocalCachedBlocks(list);
      onUpdate(list);
    },
    (err) => {
      console.warn('Error en subscripción a bloqueos_espacios:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Save or update a space block
 */
export async function saveSpaceBlock(block: SpaceBlock): Promise<SpaceBlock> {
  const finalBlock: SpaceBlock = {
    ...block,
    id: block.id || `block_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    activo: block.activo !== undefined ? block.activo : true,
    createdAt: block.createdAt || new Date().toISOString()
  };

  const db = getDb();
  if (!db) throw new Error("No hay conexión con la base de datos. Conserva los datos y reintenta.");
  if (db) {
    try {
      const docRef = doc(db, COLLECTION_NAME, finalBlock.id);
      await setDoc(docRef, finalBlock);
    } catch (err) {
      console.error('Error guardando bloqueo en Firestore:', err);
      throw err;
    }
  }

  const current = getLocalCachedBlocks();
  setLocalCachedBlocks(current.some(b => b.id === finalBlock.id)
    ? current.map(b => b.id === finalBlock.id ? finalBlock : b)
    : [finalBlock, ...current]);
  return finalBlock;
}

/**
 * Delete a space block
 */
export async function deleteSpaceBlock(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("No hay conexión con la base de datos. Conserva los datos y reintenta.");
  if (db) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
      setLocalCachedBlocks(getLocalCachedBlocks().filter(b => b.id !== id));
    } catch (err) {
      console.error('Error eliminando bloqueo en Firestore:', err);
      throw err;
    }
  }
}

/**
 * Helper to check if a specific space and time overlaps with an active space block.
 * Returns the matching block if blocked, or null if clear.
 */
export function checkSpaceBlocked(
  space: string,
  date: string, // YYYY-MM-DD
  startTime: string, // HH:mm
  endTime: string, // HH:mm
  blocks: SpaceBlock[]
): SpaceBlock | null {
  if (!space || !date || !blocks || blocks.length === 0) return null;
  const targetSpaceNorm = normalizeSpaceName(space);
  const startMin = timeToMinutes(startTime || '08:00');
  const endMin = timeToMinutes(endTime || '22:30');

  for (const b of blocks) {
    if (!b.activo) continue;
    // Check if target date is within block range [fechaInicio, fechaFin]
    if (date < b.fechaInicio || date > b.fechaFin) continue;

    // Check space matching (identical or sub-spaces if configured)
    const blockSpaceNorm = normalizeSpaceName(b.espacio);
    const matchesSpace = blockSpaceNorm === targetSpaceNorm ||
      (b.bloquearSubEspacios && targetSpaceNorm.includes(blockSpaceNorm)) ||
      (b.bloquearSubEspacios && blockSpaceNorm.includes(targetSpaceNorm));

    if (!matchesSpace) continue;

    // Check time collision
    if (b.todoElDia) {
      return b;
    }

    const bStartMin = timeToMinutes(b.horaInicio || '08:00');
    const bEndMin = timeToMinutes(b.horaFin || '22:30');

    // Overlap: startMin < bEndMin && endMin > bStartMin
    if (startMin < bEndMin && endMin > bStartMin) {
      return b;
    }
  }

  return null;
}

/**
 * Get all active blocks for a particular date
 */
export function getBlocksForDate(date: string, blocks: SpaceBlock[]): SpaceBlock[] {
  if (!date || !blocks) return [];
  return blocks.filter((b) => b.activo && date >= b.fechaInicio && date <= b.fechaFin);
}
