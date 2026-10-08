import { doc, getDocFromServer, setDoc, writeBatch } from '../firebase/gateway';
import { getDb } from '../firebase/config';
import type { AuditChangeLogEntry } from '../types';
import { splitBackupPayload } from '../utils/backupChunks';
import { cleanForFirestore } from './reservationService';

export class AuditNotSyncedError extends Error {}

/** Publish the manifest only after every snapshot part is durably stored. */
export async function persistAuditEntry(entry: AuditChangeLogEntry): Promise<void> {
  const db = getDb();
  const ref = doc(db, 'audit_logs', entry.id);
  const cleaned = cleanForFirestore(entry);
  if (new TextEncoder().encode(JSON.stringify(cleaned)).byteLength <= 800_000) {
    await setDoc(ref, cleaned);
    return;
  }
  const { previousState, newState, ...metadata } = cleaned;
  const parts = splitBackupPayload(JSON.stringify({ previousState, newState }));
  // Bound total request bytes, including large attachments.
  for (let start = 0; start < parts.length; start += 8) {
    const batch = writeBatch(db);
    parts.slice(start, start + 8).forEach((payload, offset) => {
      const index = start + offset;
      batch.set(doc(db, 'audit_logs', entry.id, 'partes', String(index)), { index, payload });
    });
    await batch.commit();
  }
  await setDoc(ref, { ...metadata, snapshotParts: parts.length });
}

export async function fetchFullAuditEntry(id: string): Promise<AuditChangeLogEntry> {
  const db = getDb();
  const snapshot = await getDocFromServer(doc(db, 'audit_logs', id));
  if (!snapshot.exists()) throw new AuditNotSyncedError('El registro aún no está respaldado en el servidor. Espera la sincronización y vuelve a intentar.');
  const entry = { ...snapshot.data(), id } as AuditChangeLogEntry;
  const groups=(entry as any).operationParts;
  if(groups){let previousState:any[]=[],newState:any[]=[];
    for(const group of groups){let payload='';for(const key of group.keys||[group]){const part=await getDocFromServer(doc(db,'audit_logs',id,'partes',key));if(!part.exists()||typeof part.data().payload!=='string')throw new Error('El respaldo está incompleto.');payload+=part.data().payload;}const state=JSON.parse(payload);previousState.push(...state.previousState);newState.push(...state.newState);}
    return {...entry,previousState,newState};
  }
  if (!entry.snapshotParts || entry.isReverted) return entry;
  if (!Number.isInteger(entry.snapshotParts) || entry.snapshotParts < 1 || entry.snapshotParts > 1000) {
    throw new Error('El respaldo contiene un manifiesto inválido.');
  }
  const parts: string[] = [];
  for (let start = 0; start < entry.snapshotParts; start += 8) {
    const snapshots = await Promise.all(Array.from({ length: Math.min(8, entry.snapshotParts - start) },
      (_, offset) => getDocFromServer(doc(db, 'audit_logs', id, 'partes', String(start + offset)))));
    snapshots.forEach((part, offset) => {
      const data = part.data();
      if (!part.exists() || data?.index !== start + offset || typeof data.payload !== 'string') {
        throw new Error('El respaldo está incompleto. No se modificó ninguna reserva.');
      }
      parts.push(data.payload);
    });
  }
  const payload = JSON.parse(parts.join(''));
  return { ...entry, previousState: payload.previousState, newState: payload.newState };
}
