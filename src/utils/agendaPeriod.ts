import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Reservation, ViewMode } from "../types";
import { timeToMinutes } from "./conflictDetector";

export const isAgendaView = (view: ViewMode) =>
  view === "calendar" || view === "daily" || view === "timeline" || view === "mobile";

/** Count unique reservations intersecting the visible period, including overnight bookings. No I/O. */
export function getAgendaPeriodCount(
  reservations: readonly Reservation[],
  view: ViewMode,
  date: Date,
): number {
  if (!isAgendaView(view)) return reservations.length;
  const isMonth = view === "calendar";
  const period = format(date, isMonth ? "yyyy-MM" : "yyyy-MM-dd");
  const prevBoundaryDate = format(
    isMonth
      ? new Date(date.getFullYear(), date.getMonth(), 0)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1),
    "yyyy-MM-dd",
  );
  const ids = new Set<string>();

  for (let i = 0; i < reservations.length; i++) {
    const reservation = reservations[i];
    const rawFecha = reservation?.fecha;
    if (!rawFecha) continue;
    const fecha = rawFecha.length === 10 ? rawFecha : rawFecha.trim();
    if (fecha.startsWith(period)) {
      ids.add(reservation.id);
      continue;
    }
    if (fecha === prevBoundaryDate) {
      const endMin = timeToMinutes(reservation.horaFin);
      const overnight =
        Boolean(reservation.terminaDiaSiguiente) ||
        (endMin > 0 && endMin <= timeToMinutes(reservation.horaInicio));
      if (overnight) {
        ids.add(reservation.id);
      }
    }
  }
  return ids.size;
}

export function getAgendaPeriodLabel(view: ViewMode, date: Date): string {
  return isAgendaView(view)
    ? format(
        date,
        view === "calendar" ? "MMMM 'de' yyyy" : "dd 'de' MMMM 'de' yyyy",
        { locale: es },
      )
    : "datos cargados";
}
