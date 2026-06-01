import crypto from 'crypto';

/**
 * Generate a SHA-256 hash of the snippet content
 * This ensures immutability and allows verification of snippet integrity
 */
export function generateSnippetHash(
  title: string,
  description: string,
  code: string,
  language: string,
  tags: string[]
): string {
  // Create a canonical representation of the snippet content
  const content = JSON.stringify({
    title,
    description,
    code,
    language,
    tags: tags.sort() // Sort tags for consistent hashing
  });

  // Generate SHA-256 hash
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  
  return hash;
}

/**
 * Verify if the current snippet content matches the stored hash
 */
export function verifySnippetHash(
  title: string,
  description: string,
  code: string,
  language: string,
  tags: string[],
  storedHash: string
): boolean {
  const currentHash = generateSnippetHash(title, description, code, language, tags);
  return currentHash === storedHash;
}

/**
 * Generate a hash for batch verification
 * Useful when verifying multiple snippets at once
 */
export function generateBatchHash(snippetHashes: string[]): string {
  const combined = snippetHashes.sort().join('|');
  return crypto.createHash('sha256').update(combined).digest('hex');
}