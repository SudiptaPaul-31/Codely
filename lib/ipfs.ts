import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { CID } from 'multiformats/cid';

// Singleton instance to avoid creating multiple Helia nodes
let heliaInstance: any = null;
let unixfsInstance: any = null;

/**
 * Initialize and get the Helia instance
 */
async function getHelia() {
  if (!heliaInstance) {
    heliaInstance = await createHelia();
    unixfsInstance = unixfs(heliaInstance);
  }
  return { helia: heliaInstance, fs: unixfsInstance };
}

/**
 * Store content on IPFS and return the CID
 */
export async function storeOnIPFS(content: string): Promise<string> {
  try {
    const { fs } = await getHelia();
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    
    // Add the content to IPFS
    const cid = await fs.addBytes(bytes);
    return cid.toString();
  } catch (error) {
    console.error('[IPFS] Error storing content:', error);
    throw new Error('Failed to store content on IPFS');
  }
}

/**
 * Retrieve content from IPFS using a CID
 */
export async function retrieveFromIPFS(cidString: string): Promise<string> {
  try {
    const { fs } = await getHelia();
    const cid = CID.parse(cidString);
    
    // Read the content from IPFS
    const chunks: Uint8Array[] = [];
    for await (const chunk of fs.cat(cid)) {
      chunks.push(chunk);
    }
    
    // Concatenate chunks and decode to string
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(result);
  } catch (error) {
    console.error('[IPFS] Error retrieving content:', error);
    throw new Error('Failed to retrieve content from IPFS');
  }
}

/**
 * Shutdown the Helia node (useful for cleanup)
 */
export async function shutdownIPFS() {
  if (heliaInstance) {
    await heliaInstance.stop();
    heliaInstance = null;
    unixfsInstance = null;
  }
}
