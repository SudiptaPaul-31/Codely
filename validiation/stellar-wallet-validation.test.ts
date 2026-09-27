import { validateStellarAddress, isValidStellarAddress } from '../lib/stellar-wallet-validation';

describe('Stellar Wallet Validation', () => {
  const validAddress = 'GB3T5Y73X7P54R3F2R2L63K3627HXYF475V5RKTF5ZQ22J4LZRVKZ2B5';
  const invalidAddress = 'GB3T5Y73X7P54R3F2R2L63K3627HXYF475V5RKTF5ZQ22J4LZRVKZ2B'; // Too short
  const malformedAddress = 'invalid-address';
  const secretKey = 'SA3T5Y73X7P54R3F2R2L63K3627HXYF475V5RKTF5ZQ22J4LZRVKZ2B5'; // Starting with S
  
  describe('validateStellarAddress', () => {
    it('should return true for a valid Stellar address', () => {
      expect(validateStellarAddress(validAddress)).toBe(true);
    });

    it('should throw for an invalid Stellar address length', () => {
      expect(() => validateStellarAddress(invalidAddress)).toThrow('Invalid Stellar wallet address');
    });

    it('should throw for a malformed address', () => {
      expect(() => validateStellarAddress(malformedAddress)).toThrow('Invalid Stellar wallet address');
    });

    it('should throw if secret key is passed instead of public key', () => {
      expect(() => validateStellarAddress(secretKey)).toThrow('Invalid Stellar wallet address');
    });

    it('should throw for empty string', () => {
      expect(() => validateStellarAddress('')).toThrow('Invalid Stellar wallet address');
    });
    
    it('should throw for null or undefined', () => {
      expect(() => validateStellarAddress(null as any)).toThrow('Invalid Stellar wallet address');
      expect(() => validateStellarAddress(undefined as any)).toThrow('Invalid Stellar wallet address');
    });
  });

  describe('isValidStellarAddress', () => {
    it('should return true for a valid Stellar address', () => {
      expect(isValidStellarAddress(validAddress)).toBe(true);
    });

    it('should return false for an invalid Stellar address length', () => {
      expect(isValidStellarAddress(invalidAddress)).toBe(false);
    });

    it('should return false for a malformed address', () => {
      expect(isValidStellarAddress(malformedAddress)).toBe(false);
    });

    it('should return false if secret key is passed instead of public key', () => {
      expect(isValidStellarAddress(secretKey)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidStellarAddress('')).toBe(false);
    });
    
    it('should return false for null or undefined', () => {
      expect(isValidStellarAddress(null as any)).toBe(false);
      expect(isValidStellarAddress(undefined as any)).toBe(false);
    });
  });
});
