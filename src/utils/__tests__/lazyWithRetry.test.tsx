// @vitest-environment jsdom
import { Component, Suspense, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { lazyWithRetry } from '../lazyWithRetry';

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { return this.state.error ? <div role="alert">{this.state.error.message}</div> : this.props.children; }
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear(); });

it('loads the view when sessionStorage access throws', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  const factory = vi.fn(async () => ({ default: () => <div>Vista lista</div> }));
  const View = lazyWithRetry(factory);
  render(<Suspense fallback="Cargando"><View /></Suspense>);
  expect(await screen.findByText('Vista lista')).toBeTruthy();
  expect(factory).toHaveBeenCalledTimes(1);
});

it('keeps the existing delayed retry and clears a previous reload marker after success', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sessionStorage.setItem('lazy_retry_reload_RetryView', 'true');
  const factory = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: () => <div>Recuperada</div> });
  const View = lazyWithRetry(factory, 'RetryView');
  await act(async () => { render(<Suspense fallback="Cargando"><View /></Suspense>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(599); });
  expect(factory).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText('Recuperada')).toBeTruthy();
  expect(factory).toHaveBeenCalledTimes(2);
  expect(sessionStorage.getItem('lazy_retry_reload_RetryView')).toBeNull();
});

it('surfaces the chunk failure after three attempts when a reload marker cannot be saved', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
  const error = Object.assign(new Error('Chunk unavailable'), { name: 'ChunkLoadError' });
  const factory = vi.fn().mockRejectedValue(error);
  const View = lazyWithRetry(factory);
  await act(async () => { render(<Boundary><Suspense fallback="Cargando"><View /></Suspense></Boundary>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
  expect(factory).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toBe('Chunk unavailable');
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(factory).toHaveBeenCalledTimes(3);
});

it('does not reload when the previous reload marker cannot be read', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Read denied'); });
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const factory = vi.fn().mockRejectedValue(Object.assign(new Error('Chunk unavailable'), { name: 'ChunkLoadError' }));
  const View = lazyWithRetry(factory);
  await act(async () => { render(<Boundary><Suspense fallback="Cargando"><View /></Suspense></Boundary>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
  expect(factory).toHaveBeenCalledTimes(3);
  expect(write).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toBe('Chunk unavailable');
});
