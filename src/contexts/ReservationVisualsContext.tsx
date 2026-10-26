import React, { createContext, useContext, useMemo } from 'react';
import type { ActivityTypeItem, Reservation } from '../types';
import { createReservationVisualRegistry } from '../utils/reservationVisuals';

const ReservationVisualsContext = createContext(createReservationVisualRegistry());

export function ReservationVisualsProvider({ activityTypes, reservations, children }: {
  activityTypes: readonly ActivityTypeItem[];
  reservations: readonly Reservation[];
  children: React.ReactNode;
}) {
  const registry = useMemo(() => createReservationVisualRegistry(activityTypes, reservations), [activityTypes, reservations]);
  return <ReservationVisualsContext.Provider value={registry}>{children}</ReservationVisualsContext.Provider>;
}

export const useReservationVisuals = () => useContext(ReservationVisualsContext);
