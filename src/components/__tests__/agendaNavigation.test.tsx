// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Navbar } from "../Navbar";
import { AgendaToolbar } from "../AgendaToolbar";

afterEach(cleanup);
const props = {
  currentView: "calendar" as const,
  onViewChange: vi.fn(),
  onNewReservation: vi.fn(),
  onOpenImportExport: vi.fn(),
  totalReservas: 0,
  conflictsCount: 0,
};

it("returns to the last agenda presentation after visiting another section", () => {
  const change = vi.fn();
  const { rerender } = render(
    <Navbar {...props} currentView="mobile" onViewChange={change} />,
  );
  rerender(<Navbar {...props} currentView="ratings" onViewChange={change} />);
  fireEvent.click(
    within(screen.getByLabelText("Navegación principal")).getByRole("button", {
      name: "Agenda",
    }),
  );
  expect(change).toHaveBeenLastCalledWith("mobile");
});

it("keeps mobile sections in a modal and closes it after choosing a section", () => {
  const change = vi.fn();
  render(<Navbar {...props} onViewChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Más" }));
  const drawer = screen.getByRole("dialog", {
    name: "Navegación y herramientas",
  });
  fireEvent.click(
    within(drawer).getByRole("button", { name: "Administración" }),
  );
  expect(change).toHaveBeenCalledWith("admin");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("exposes bulk deletion only inside tools and only when the parent authorizes it", () => {
  const remove = vi.fn();
  const { rerender } = render(<Navbar {...props} onDeleteDay={remove} />);
  expect(
    screen.queryByRole("button", { name: "Eliminar reservas de un día" }),
  ).toBeNull();
  fireEvent.click(screen.getByLabelText("Menú de herramientas del sistema"));
  fireEvent.click(
    screen.getByRole("button", { name: "Eliminar reservas de un día" }),
  );
  expect(remove).toHaveBeenCalledOnce();
  rerender(<Navbar {...props} />);
  fireEvent.click(screen.getByLabelText("Menú de herramientas del sistema"));
  expect(
    screen.queryByRole("button", { name: "Eliminar reservas de un día" }),
  ).toBeNull();
});

it("maps the legacy daily presentation to Día and delegates view changes", () => {
  const change = vi.fn();
  render(
    <AgendaToolbar
      view="daily"
      onViewChange={change}
      summary="3 reservas"
      filtersOpen={false}
      hasActiveFilters={false}
      onToggleFilters={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Día" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Lista" }));
  expect(change).toHaveBeenCalledWith("mobile");
});
