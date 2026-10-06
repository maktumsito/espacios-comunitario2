import Fuse, { IFuseOptions } from 'fuse.js';
import { Reservation } from '../types';

const defaultFuseOptions: IFuseOptions<Reservation> = {
  keys: [
    { name: 'responsable', weight: 0.3 },
    { name: 'descripcion', weight: 0.25 },
    { name: 'tipoActividad', weight: 0.15 },
    { name: 'espacio', weight: 0.15 },
    { name: 'fecha', weight: 0.15 },
    { name: 'rut', weight: 0.1 },
    { name: 'emailContacto', weight: 0.05 },
    { name: 'telefonoContacto', weight: 0.05 },
    { name: 'id', weight: 0.05 }
  ],
  threshold: 0.38, // Allows spelling typos e.g. "auditoro" -> "auditorio", "gonzales" -> "González"
  distance: 100,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true
};

// In-memory cache for Fuse index keyed by reservations array reference
let cachedReservationsRef: readonly Reservation[] | null = null;
let cachedFuseInstance: Fuse<Reservation> | null = null;

export function getReservationsFuse(reservations: Reservation[]): Fuse<Reservation> {
  if (cachedFuseInstance && cachedReservationsRef === reservations) {
    return cachedFuseInstance;
  }
  cachedReservationsRef = reservations;
  cachedFuseInstance = new Fuse(reservations, defaultFuseOptions);
  return cachedFuseInstance;
}

/**
 * Searches a list of reservations prioritizing exact and substring matches,
 * with Fuse.js fuzzy matching as fallback for typo tolerance.
 */
export function fuzzySearchReservations(
  reservations: Reservation[],
  query: string
): Reservation[] {
  const trimmed = query.trim();
  if (!trimmed) return reservations;

  // Clean RUT digits for exact RUT match priority
  const cleanRutQ = trimmed.replace(/[^0-9kK]/g, '').toLowerCase();
  const normQ = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isYearOrDateQuery = /^\d{4}$/.test(trimmed) || /^\d{4}-\d{2}/.test(trimmed) || /^\d{2}-\d{2}-\d{4}/.test(trimmed);

  // 1. Separate exact and substring matches into priority tiers
  const exactMatches: { res: Reservation; priority: number }[] = [];
  const exactMatchedIds = new Set<string>();

  for (const r of reservations) {
    const cleanR = (r.rut || '').replace(/[^0-9kK]/g, '').toLowerCase();
    const normId = (r.id || '').toLowerCase();
    const normResp = (r.responsable || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normTipo = (r.tipoActividad || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normEsp = (r.espacio || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normDesc = (r.descripcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normFecha = (r.fecha || '').trim().toLowerCase();

    // Priority 1: Exact ID match or exact RUT match or exact Name/Activity/Fecha match
    if (
      normId === normQ ||
      (cleanRutQ.length >= 7 && cleanR === cleanRutQ) ||
      normResp === normQ ||
      normTipo === normQ ||
      normFecha === normQ
    ) {
      exactMatches.push({ res: r, priority: 1 });
      exactMatchedIds.add(r.id);
      continue;
    }

    // Priority 2: Starts with query (name, activity, space, RUT, ID, fecha)
    if (
      normResp.startsWith(normQ) ||
      normTipo.startsWith(normQ) ||
      normEsp.startsWith(normQ) ||
      (cleanRutQ.length >= 3 && cleanR.startsWith(cleanRutQ)) ||
      normId.startsWith(normQ) ||
      normFecha.startsWith(normQ)
    ) {
      exactMatches.push({ res: r, priority: 2 });
      exactMatchedIds.add(r.id);
      continue;
    }

    // Priority 3: Substring includes match
    if (
      normResp.includes(normQ) ||
      normTipo.includes(normQ) ||
      normEsp.includes(normQ) ||
      normDesc.includes(normQ) ||
      normFecha.includes(normQ) ||
      (cleanRutQ.length >= 3 && cleanR.includes(cleanRutQ)) ||
      normId.includes(normQ)
    ) {
      exactMatches.push({ res: r, priority: 3 });
      exactMatchedIds.add(r.id);
    }
  }

  exactMatches.sort((a, b) => a.priority - b.priority);
  const prioritizedResults: Reservation[] = exactMatches.map((m) => m.res);

  // 2. Fallback to Fuse.js for typo tolerance (only for non-date/year textual queries)
  if (!isYearOrDateQuery) {
    const fuse = getReservationsFuse(reservations);
    const fuseResults = fuse.search(trimmed);

    for (const match of fuseResults) {
      if (!exactMatchedIds.has(match.item.id)) {
        prioritizedResults.push(match.item);
      }
    }
  }

  return prioritizedResults;
}

/**
 * Returns a Set of matching IDs for high performance filtering within filter pipelines
 */
export function getFuzzyMatchIds(
  reservations: Reservation[],
  query: string
): Set<string> {
  const matches = fuzzySearchReservations(reservations, query);
  return new Set(matches.map((r) => r.id));
}

/**
 * Generic fuzzy search helper for any array of objects using Fuse.js
 * with exact and prefix match prioritization.
 */
export function fuzzySearchItems<T>(
  items: readonly T[],
  query: string,
  keys: string[],
  threshold = 0.4
): T[] {
  const trimmed = (query || '').trim();
  if (!trimmed) return [...items];

  const normQ = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const exactMatches: { item: T; priority: number }[] = [];
  const exactMatchedSet = new Set<T>();

  for (const item of items) {
    let bestPriority = Infinity;

    for (const key of keys) {
      const val = (item as any)[key];
      if (typeof val !== 'string') continue;
      const normVal = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (normVal === normQ) {
        bestPriority = Math.min(bestPriority, 1);
      } else if (normVal.startsWith(normQ)) {
        bestPriority = Math.min(bestPriority, 2);
      } else if (normVal.includes(normQ)) {
        bestPriority = Math.min(bestPriority, 3);
      }
    }

    if (bestPriority < Infinity) {
      exactMatches.push({ item, priority: bestPriority });
      exactMatchedSet.add(item);
    }
  }

  exactMatches.sort((a, b) => a.priority - b.priority);
  const result: T[] = exactMatches.map((m) => m.item);

  const fuse = new Fuse(items as T[], {
    keys,
    threshold,
    distance: 100,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true
  });

  const fuseResults = fuse.search(trimmed);
  for (const res of fuseResults) {
    if (!exactMatchedSet.has(res.item)) {
      result.push(res.item);
    }
  }

  return result;
}

