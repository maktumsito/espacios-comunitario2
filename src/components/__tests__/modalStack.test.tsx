// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BaseModal } from '../common/BaseModal';
import { ModalOverlay } from '../common/ModalOverlay';
import { NotificationPortal } from '../common/NotificationPortal';

beforeEach(() => { document.body.style.overflow = 'auto'; document.body.style.paddingRight = '12px'; });
afterEach(() => { cleanup(); document.body.style.overflow = ''; document.body.style.paddingRight = ''; });

function Stack({ parentOpen = true }: { parentOpen?: boolean }) {
  const [child, setChild] = useState(false);
  const [grandchild, setGrandchild] = useState(false);
  return <>
    <button>Fondo</button>
    <BaseModal isOpen={parentOpen} onClose={vi.fn()} title="Reserva">
      <input aria-label="Nombre" defaultValue="Taller" />
      <button onClick={() => setChild(true)}>Abrir documento</button>
    </BaseModal>
    {child && <ModalOverlay onClose={() => setChild(false)} aria-label="Documento" className="fixed inset-0">
      <button onClick={() => setGrandchild(true)}>Confirmar documento</button>
      <button onClick={() => setChild(false)}>Volver a reserva</button>
      {grandchild && <BaseModal isOpen title="Confirmación" onClose={() => setGrandchild(false)}>
        <button>Aceptar</button><button onClick={() => setGrandchild(false)}>Cancelar confirmación</button>
      </BaseModal>}
    </ModalOverlay>}
  </>;
}

it('places each newly opened window above earlier ones, including custom layouts', () => {
  const view = render(<Stack />);
  fireEvent.click(screen.getByText('Abrir documento'));
  fireEvent.click(screen.getByText('Confirmar documento'));
  const all = screen.getAllByRole('dialog', { hidden: true });
  expect(all).toHaveLength(3);
  expect(all.map(dialog => Number(dialog.style.zIndex))).toEqual([100, 101, 102]);
  expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy();
  expect(all.slice(0, 2).every(dialog => dialog.hasAttribute('inert') && dialog.getAttribute('aria-hidden') === 'true')).toBe(true);
  expect(view.container.hasAttribute('inert')).toBe(true);
  expect(all.every(dialog => dialog.parentElement === document.body)).toBe(true);
});

it('closes only the top window with Escape and restores the previous window and its input', () => {
  render(<Stack />);
  const name = screen.getByLabelText('Nombre');
  fireEvent.change(name, { target: { value: 'Taller editado' } });
  const trigger = screen.getByText('Abrir documento'); trigger.focus(); fireEvent.click(trigger);
  const childTrigger = screen.getByText('Confirmar documento'); childTrigger.focus(); fireEvent.click(childTrigger);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Documento');
  expect(document.activeElement).toBe(childTrigger);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(document.activeElement).toBe(trigger);
  expect((name as HTMLInputElement).value).toBe('Taller editado');
  expect(document.body.style.overflow).toBe('hidden');
});

it('keeps the background locked when the lower window is removed first and restores original styles at the end', () => {
  const { rerender, unmount } = render(<Stack />);
  fireEvent.click(screen.getByText('Abrir documento'));
  const padding = document.body.style.paddingRight;
  rerender(<Stack parentOpen={false} />);
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.body.style.paddingRight).toBe(padding);
  expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Documento');
  unmount();
  expect(document.body.style.overflow).toBe('auto');
  expect(document.body.style.paddingRight).toBe('12px');
});

it('traps Tab and redirects attempted background focus to the active window', () => {
  render(<Stack />);
  fireEvent.click(screen.getByText('Abrir documento'));
  const first = screen.getByText('Confirmar documento'), last = screen.getByText('Volver a reserva');
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
  screen.getByText('Fondo').focus(); expect(document.activeElement).toBe(first);
});

it('preserves original inert attributes, gives titles unique IDs, and restores outside focus in StrictMode', () => {
  const trigger = document.createElement('button'); trigger.textContent = 'Abrir'; document.body.appendChild(trigger); trigger.focus();
  const protectedRegion = document.createElement('div'); protectedRegion.setAttribute('inert', ''); document.body.appendChild(protectedRegion);
  const { unmount } = render(<StrictMode><BaseModal isOpen title="Principal" onClose={vi.fn()}>
    <BaseModal isOpen title="Secundaria" onClose={vi.fn()}>Contenido</BaseModal>
  </BaseModal></StrictMode>);
  const ids = screen.getAllByRole('dialog', { hidden: true }).map(dialog => dialog.getAttribute('aria-labelledby'));
  expect(new Set(ids).size).toBe(2);
  unmount(); expect(document.activeElement).toBe(trigger);
  expect(protectedRegion.hasAttribute('inert')).toBe(true);
  expect(trigger.hasAttribute('inert')).toBe(false);
  trigger.remove(); protectedRegion.remove();
});

it('does not propagate clicks from a nested portal to the parent backdrop', () => {
  const closeParent = vi.fn();
  render(<ModalOverlay className="fixed inset-0" onClose={closeParent} closeOnBackdrop>
    <ModalOverlay className="fixed inset-0" onClose={vi.fn()}><button>Acción superior</button></ModalOverlay>
  </ModalOverlay>);
  fireEvent.click(screen.getByText('Acción superior'));
  expect(closeParent).not.toHaveBeenCalled();
});

it('keeps status notifications outside the inert background and outside the modal stack', () => {
  render(<><NotificationPortal><p role="status">Guardado</p></NotificationPortal><Stack /></>);
  expect(screen.getByRole('status').closest('[inert]')).toBeNull();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});
