import * as StellarSdk from 'stellar-sdk';

/**
 * Validates a Stellar wallet address (public key).
 * 
 * @param address - The Stellar wallet address to validate (e.g., G...)
 * @returns true if valid
 * @throws Error if the address is malformed or invalid
 */
export function validateStellarAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    throw new Error("Invalid Stellar wallet address");
  }
  
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
    throw new Error("Invalid Stellar wallet address");
  }
  
  return true;
}

/**
 * Validates a Stellar wallet address (public key) safely without throwing.
 * 
 * @param address - The Stellar wallet address to validate (e.g., G...)
 * @returns true if valid, false otherwise
 */
export function isValidStellarAddress(address: string): boolean {
  try {
    if (!address || typeof address !== 'string') return false;
    return StellarSdk.StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}
