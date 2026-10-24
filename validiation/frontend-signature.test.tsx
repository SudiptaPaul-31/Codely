/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { WalletProvider, useWallet } from '../components/WalletConnect';
import React from 'react';

// The provider restores a session from encrypted storage (not plain
// localStorage keys); stand in a stored Freighter session for the "connected"
// case. readSession returns null unless a test sets one.
const mockSession: { current: unknown } = { current: null };
jest.mock('@/wallet/lib/sessionStorage', () => ({
  readSession: jest.fn(async () => mockSession.current),
  persistSession: jest.fn(async () => undefined),
  clearSession: jest.fn(),
}));

// Mock the crypto API for randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-1234'
  }
});

// Mock Freighter API
const mockSignMessage = jest.fn();
Object.defineProperty(window, 'freighterApi', {
  value: {
    signMessage: mockSignMessage
  },
  writable: true
});

// Mock fetch for wallet auth calls inside connect
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ nonce: "auth-nonce", message: "auth-message", token: "auth-token" }),
  })
) as jest.Mock;

describe('WalletConnect signAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSession.current = null;
  });

  it('should throw an error if wallet is not connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

    await expect(result.current.signAction('delete_snippet', '123')).rejects.toThrow('Wallet not connected');
  });

  it('should successfully prompt freighter and return signature data', async () => {
    // 1. Setup mock signature
    mockSignMessage.mockResolvedValue('base64-test-signature');

    // 2. A stored session, so the provider reconnects on mount
    mockSession.current = {
      publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ',
      walletName: 'Freighter',
      walletProvider: 'freighter',
      token: 'test-token',
      expiresAt: Date.now() + 60_000,
    };

    const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

    // Wait for the provider to verify and restore the session
    await waitFor(() => expect(result.current.connected).toBe(true));

    // 3. Call signAction
    const actionResult = await result.current.signAction('delete_snippet', '123');

    // 4. Verify results
    expect(actionResult).toHaveProperty('signature', 'base64-test-signature');
    expect(actionResult).toHaveProperty('nonce', 'test-uuid-1234');
    expect(actionResult).toHaveProperty('timestamp');
    
    // 5. Verify freighter was called with the correct message format
    expect(mockSignMessage).toHaveBeenCalled();
    const calledMessage = mockSignMessage.mock.calls[0][0];
    expect(calledMessage).toContain('Action: delete_snippet');
    expect(calledMessage).toContain('Resource: 123');
    expect(calledMessage).toContain('Nonce: test-uuid-1234');
  });
});
