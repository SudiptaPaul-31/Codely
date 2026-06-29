import { renderHook, act } from '@testing-library/react';
import { WalletProvider, useWallet } from '../components/WalletConnect';
import React from 'react';

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
  });

  it('should throw an error if wallet is not connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

    await expect(result.current.signAction('delete_snippet', '123')).rejects.toThrow('Wallet not connected');
  });

  it('should successfully prompt freighter and return signature data', async () => {
    // 1. Setup mock signature
    mockSignMessage.mockResolvedValue('base64-test-signature');

    // 2. Pre-authenticate the wallet in localStorage so it initializes as connected
    localStorage.setItem('authToken', 'test-token');
    localStorage.setItem('walletAddress', 'GABCDEFGHIJKLMNOPQRSTUVWXYZ');
    localStorage.setItem('walletName', 'freighter');

    const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

    // Wait for the context to initialize from localStorage
    await act(async () => {
      // simulate a small delay if needed
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

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
