// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ write: vi.fn(), user: { username: 'admin' } as any }));
vi.mock('../../firebase/config', () => ({ getDb: () => ({}), getFirebaseApp: vi.fn() }));
vi.mock('../../firebase/gateway', () => ({ doc: (...args: any[]) => args.slice(1).join('/'), setDoc: state.write }));
vi.mock('../authService', () => ({ getCurrentUser: () => state.user }));
import { saveDeviceTokenToFirestore, broadcastFcmNotification } from '../fcmService';
import { checkTodayImportantActivities } from '../notificationService';

beforeEach(() => {
  localStorage.clear(); state.write.mockReset().mockResolvedValue(undefined);
  state.user = { username: 'admin' };
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

it('registers the same confirmed token only once per day, including concurrent initialization', async () => {
  await Promise.all(Array.from({ length: 20 }, () => saveDeviceTokenToFirestore('token')));
  expect(state.write).toHaveBeenCalledTimes(1);
  const registeredAt = state.write.mock.calls[0][1].registeredAt;
  vi.advanceTimersByTime(23 * 60 * 60 * 1000);
  await saveDeviceTokenToFirestore('token');
  expect(state.write).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60 * 60 * 1000);
  await saveDeviceTokenToFirestore('token');
  expect(state.write).toHaveBeenCalledTimes(2);
  expect(state.write.mock.calls[1][1].registeredAt).toBe(registeredAt);
});

it('writes token and account changes immediately and never writes anonymous registrations', async () => {
  await saveDeviceTokenToFirestore('one');
  await saveDeviceTokenToFirestore('two');
  state.user = { username: 'another' };
  await saveDeviceTokenToFirestore('two');
  state.user = null;
  await saveDeviceTokenToFirestore('two');
  expect(state.write).toHaveBeenCalledTimes(3);
  expect(state.write.mock.calls[2][1].username).toBe('another');
});

it('retries rejected writes instead of marking them confirmed locally', async () => {
  state.write.mockRejectedValueOnce(new Error('quota'));
  await saveDeviceTokenToFirestore('token');
  await saveDeviceTokenToFirestore('token');
  await saveDeviceTokenToFirestore('token');
  expect(state.write).toHaveBeenCalledTimes(2);
});

it('does not broadcast to Firestore when checking today important activities on client startup', async () => {
  const today = '2026-10-16';
  checkTodayImportantActivities([
    {
      id: 'imp-1',
      fecha: today,
      horaInicio: '10:00',
      horaFin: '11:00',
      espacio: 'SALA 1',
      responsable: 'Coordinador',
      tipoActividad: 'Ceremonia',
      descripcion: 'Evento importante',
      actividadRecurrente: 'No',
      importante: 'Sí',
    },
  ]);
  expect(state.write).not.toHaveBeenCalled();
});

it('deduplicates identical FCM broadcasts within the 60s cooldown window', async () => {
  const payload = {
    type: 'important' as const,
    title: '⭐ Nueva Actividad Importante Agendada',
    body: 'Detalle de actividad',
    reservationId: 'rsv-1',
    targetDate: '2026-10-16',
  };
  const firstId = await broadcastFcmNotification(payload);
  const secondId = await broadcastFcmNotification(payload);
  expect(firstId).toBe(secondId);
  expect(state.write).toHaveBeenCalledTimes(1);
});
