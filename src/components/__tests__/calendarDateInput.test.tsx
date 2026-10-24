// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarDateInput } from '../common/CalendarDateInput';

afterEach(cleanup);
function Field({ changed = vi.fn(), min, max }: { changed?: (value: string) => void; min?: string; max?: string }) {
  const [value, setValue] = useState('2026-11-01');
  return <CalendarDateInput aria-label="Fecha" value={value} min={min} max={max} required
    onValueChange={iso => { setValue(iso); changed(iso); }} />;
}
it.each([
  ['31/11/2026','30/11/2026','2026-11-30'],
  ['31-04-2026','30/04/2026','2026-04-30'],
  ['29/02/2026','28/02/2026','2026-02-28'],
  ['31/02/2028','29/02/2028','2028-02-29'],
  ['2026-11-31','30/11/2026','2026-11-30'],
  ['31112026','30/11/2026','2026-11-30'],
])('corrects %s in the displayed field and the parent value before continuing', (raw, shown, iso) => {
  const changed=vi.fn(); render(<Field changed={changed} />);
  const input=screen.getByRole('textbox',{name:'Fecha'}) as HTMLInputElement;
  fireEvent.change(input,{target:{value:raw}});
  fireEvent.blur(input);
  expect(input.value).toBe(shown); expect(input.checkValidity()).toBe(true);
  expect(changed).toHaveBeenLastCalledWith(iso);
  expect(screen.getByRole('status').textContent).toContain(shown);
});
it('keeps partially typed dates visible, blocks continuation and recovers when completed', () => {
  const changed=vi.fn(); render(<Field changed={changed} />);
  const input=screen.getByRole('textbox',{name:'Fecha'}) as HTMLInputElement;
  for(const value of ['3','31/','31/11/','31/11/202']) fireEvent.change(input,{target:{value}});
  expect(input.value).toBe('31/11/202'); expect(changed).toHaveBeenLastCalledWith('');
  expect(input.checkValidity()).toBe(false);
  fireEvent.blur(input); expect(screen.getByRole('alert').textContent).toContain('Completa');
  fireEvent.change(input,{target:{value:'31/11/2026'}});
  expect(input.value).toBe('30/11/2026'); expect(input.checkValidity()).toBe(true);
});
it('rejects invalid months, zero days and dates outside configured bounds without changing the month or year', () => {
  render(<Field min="2026-11-01" max="2026-11-30" />);
  const input=screen.getByRole('textbox',{name:'Fecha'}) as HTMLInputElement;
  for (const value of ['15/13/2026','00/11/2026','30/12/2026','30/10/2026']) {
    fireEvent.change(input,{target:{value}}); fireEvent.blur(input);
    expect(input.checkValidity()).toBe(false); expect(screen.getByRole('alert')).toBeTruthy();
  }
});
it('accepts valid leap days, native calendar choices and external date navigation', () => {
  const changed=vi.fn(); const {container,rerender}=render(<Field changed={changed} />);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'29/02/2028'}});
  expect(changed).toHaveBeenLastCalledWith('2028-02-29'); expect(screen.queryByRole('status')).toBeNull();
  fireEvent.change(container.querySelector('input[type="date"]')!,{target:{value:'2026-12-15'}});
  expect(screen.getByRole('textbox')).toHaveProperty('value','15/12/2026');
  rerender(<CalendarDateInput aria-label="Fecha" value="2027-01-01" onValueChange={changed} />);
  expect(screen.getByRole('textbox')).toHaveProperty('value','01/01/2027');
});
