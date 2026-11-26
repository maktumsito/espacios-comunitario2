import React, { createContext, useContext, useMemo } from 'react';
import type { ActivityTypeItem, Reservation } from '../types';
import { createReservationVisualRegistry } from '../utils/reservationVisuals';

const ReservationVisualsContext = createContext(createReservationVisualRegistry());

export function ReservationVisualsProvider({ activityTypes, reservations, children }: {
  activityTypes: readonly ActivityTypeItem[];
  reservations: readonly Reservation[];
  children: React.ReactNode;
}) {
  // Stabilize context value: only recompute when the unique set of activity types actually changes
  const extraTypesKey = useMemo(() => {
    const seen = new Set<string>();
    for (let i = 0; i < reservations.length; i++) {
      const t = reservations[i].tipoActividad?.trim();
      if (t) seen.add(t);
    }
    return [...seen].sort().join('\u0000');
  }, [reservations]);

  const registry = useMemo(
    () => createReservationVisualRegistry(
      activityTypes,
      extraTypesKey ? extraTypesKey.split('\u0000').map(tipoActividad => ({ tipoActividad } as Reservation)) : []
    ),
    [activityTypes, extraTypesKey]
  );
  return <ReservationVisualsContext.Provider value={registry}>{children}</ReservationVisualsContext.Provider>;
}

export const useReservationVisuals = () => useContext(ReservationVisualsContext);
