import fs from 'fs';
import path from 'path';
import { encryptData, decryptData } from './encryption';

describe('Backup Service Encryption', () => {
  beforeAll(() => {
    // Set a dummy encryption key for tests
    process.env.BACKUP_ENCRYPTION_KEY = 'test-key-which-is-exactly-32bytes!';
  });

  it('should encrypt and decrypt data successfully', () => {
    const payload = JSON.stringify({ snippets: [{ id: '1', code: 'console.log("hello");' }] });
    
    const encrypted = encryptData(payload);
    expect(encrypted).not.toBe(payload);
    expect(encrypted.split(':').length).toBe(3); // iv:authTag:encrypted

    const decrypted = decryptData(encrypted);
    expect(decrypted).toBe(payload);
  });

  it('should throw error on malformed payload', () => {
    expect(() => decryptData('malformed-payload')).toThrow();
  });
});
