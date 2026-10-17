import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Reservation, ViewMode } from "../types";
import { getNextDayIsoString } from "./reservationIndex";

export const isAgendaView = (view: ViewMode) =>
  ["calendar", "daily", "timeline", "mobile"].includes(view);

/** Count unique reservations intersecting the visible period, including overnight bookings. No I/O. */
export function getAgendaPeriodCount(
  reservations: readonly Reservation[],
  view: ViewMode,
  date: Date,
): number {
  if (!isAgendaView(view)) return reservations.length;
  const period = format(date, view === "calendar" ? "yyyy-MM" : "yyyy-MM-dd");
  const matches = (value?: string | null) => Boolean(value?.startsWith(period));
  const ids = new Set<string>();
  const minutes = (time: string) => {
    const [hours, mins] = time.split(":").map(Number);
    return (hours || 0) * 60 + (mins || 0);
  };
  for (const reservation of reservations) {
    if (!reservation?.fecha) continue;
    const overnight =
      reservation.terminaDiaSiguiente ||
      (minutes(reservation.horaFin) > 0 &&
        minutes(reservation.horaFin) <= minutes(reservation.horaInicio));
    if (
      matches(reservation.fecha) ||
      (overnight && matches(getNextDayIsoString(reservation.fecha)))
    )
      ids.add(reservation.id);
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
