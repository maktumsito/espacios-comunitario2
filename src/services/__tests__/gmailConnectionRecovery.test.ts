// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gmailServerRequest } from '../gmailConnectionClient';
import { onAuthStateChanged, signOut } from 'firebase/auth';

vi.mock('../gmailConnectionClient', () => ({ gmailServerRequest: vi.fn(), waitForGmailPopup: vi.fn() }));
vi.mock('../../firebase/config', () => ({ getFirebaseAuth: () => ({}), getDb: () => ({}) }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined),
  signInWithPopup: vi.fn(), GoogleAuthProvider: class {}
}));

let service: typeof import('../gmailDispatchService');
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  service = await import('../gmailDispatchService');
},30000);
afterEach(() => { vi.restoreAllMocks(); });
const connected = { connected: true, persistent: true, oauthConfigured: true, email: 'cristianshute@gmail.com' };

describe('Gmail session recovery', () => {
  it('restores a connection on cold reload without a browser access token or Firebase login', async () => {
    vi.mocked(gmailServerRequest).mockResolvedValue(connected);
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      if (typeof callback === 'function') callback(null);
      return () => {};
    });
    expect(service.getGmailAccessToken()).toBeNull();
    const observed = vi.fn();
    service.subscribeGmailAuthState(observed);
    const stop = service.initGmailAuthListener();
    await service.restoreGmailConnection();
    expect(service.isGmailConnected()).toBe(true);
    expect(service.isPersistentGmailConnection()).toBe(true);
    expect(service.getCurrentGoogleUser()?.email).toBe(connected.email);
    expect(observed).toHaveBeenLastCalledWith(expect.objectContaining({ email: connected.email }), null, true, true);
    stop();
  });

  it('sends through the renewable server connection with the selected PDF attachments', async () => {
    vi.mocked(gmailServerRequest).mockImplementation(async path => path === 'gmail/status' ? connected : { success: true, messageId: 'sent' });
    const result = await service.sendActivitiesViaGmail({
      to: ['recipient@example.com'], subject: 'Planilla diaria', textBody: 'Selección', htmlBody: '<p>Selección</p>',
      attachments: [{ filename: 'day.pdf', contentType: 'application/pdf', contentBase64: 'pdf-base64' }]
    });
    expect(result).toMatchObject({ success: true, messageId: 'sent' });
    expect(gmailServerRequest).toHaveBeenCalledWith('send', expect.objectContaining({
      attachments: [{ filename: 'day.pdf', contentType: 'application/pdf', content: 'pdf-base64' }]
    }));
    expect(service.getGmailAccessToken()).toBeNull();
  });

  it('keeps authorization across a transient status failure and clears it when revocation is confirmed', async () => {
    vi.mocked(gmailServerRequest).mockResolvedValueOnce(connected).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ...connected, connected: false, persistent: false });
    await service.restoreGmailConnection();
    await service.restoreGmailConnection();
    expect(service.isGmailConnected()).toBe(true);
    await service.restoreGmailConnection();
    expect(service.isGmailConnected()).toBe(false);
  });

  it('requires server confirmation before disconnecting and signing out', async () => {
    vi.mocked(gmailServerRequest).mockResolvedValueOnce(connected).mockRejectedValueOnce(new Error('disconnect failed')).mockResolvedValueOnce({ success: true });
    await service.restoreGmailConnection();
    await expect(service.disconnectGoogleGmail()).rejects.toThrow('disconnect failed');
    expect(service.isGmailConnected()).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    await service.disconnectGoogleGmail();
    expect(service.isGmailConnected()).toBe(false);
    expect(signOut).toHaveBeenCalledOnce();
  });
});
