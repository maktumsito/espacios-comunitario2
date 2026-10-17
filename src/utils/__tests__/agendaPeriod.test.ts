import { describe, expect, it } from "vitest";
import { getAgendaPeriodCount } from "../agendaPeriod";
import { Reservation } from "../../types";

const booking = (
  id: string,
  fecha: string,
  extra: Partial<Reservation> = {},
): Reservation => ({
  id,
  fecha,
  horaInicio: "10:00",
  horaFin: "11:00",
  espacio: "SALA 2",
  descripcion: "Taller comunitario",
  responsable: "Organización comunitaria",
  tipoActividad: "TALLER",
  actividadRecurrente: "No",
  ...extra,
});

describe("visible agenda period", () => {
  const rows = [
    booking("old", "2026-09-20"),
    booking("one", "2026-10-17"),
    booking("two", "2026-10-19"),
    booking("future", "2026-11-01"),
  ];
  it("counts the visible month rather than the loaded history", () => {
    expect(getAgendaPeriodCount(rows, "calendar", new Date(2026, 9, 17))).toBe(
      2,
    );
  });
  it.each(["daily", "timeline", "mobile"] as const)(
    "uses the same day boundary in %s",
    (view) => {
      expect(getAgendaPeriodCount(rows, view, new Date(2026, 9, 17))).toBe(1);
    },
  );
  it("includes overnight reservations and deduplicates IDs at month boundaries", () => {
    const overnight = booking("overnight", "2026-09-30", {
      horaInicio: "23:00",
      horaFin: "01:00",
      terminaDiaSiguiente: true,
    });
    expect(
      getAgendaPeriodCount(
        [overnight, overnight, ...rows],
        "calendar",
        new Date(2026, 9, 1),
      ),
    ).toBe(3);
    expect(
      getAgendaPeriodCount([overnight], "mobile", new Date(2026, 9, 1)),
    ).toBe(1);
  });
  it('does not interpret unpadded morning hours as an overnight reservation', () => {
    const morning = booking('morning', '2026-10-16', { horaInicio: '9:00', horaFin: '10:00' });
    expect(getAgendaPeriodCount([morning], 'mobile', new Date(2026, 9, 17))).toBe(0);
  });

});
