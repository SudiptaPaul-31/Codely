import { NextRequest, NextResponse } from 'next/server';
import { getSnippetWithHash, verifySnippetIntegrity, storeSnippetHash } from '@/lib/db';
import { generateSnippetHash } from '@/lib/hash';
import { submitHashToStellar } from '@/lib/stellar';

/**
 * POST /api/snippets/[id]/verify
 * Store the snippet hash on the Stellar blockchain
 * 
 * Body: { secretKey?: string } - Optional secret key for signing (for future SDK integration)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get the snippet
    const snippet = await getSnippetWithHash(id);
    
    if (!snippet) {
      return NextResponse.json(
        { error: 'Snippet not found' },
        { status: 404 }
      );
    }
    
    // Generate SHA-256 hash of current snippet content
    const onChainHash = generateSnippetHash(
      snippet.title,
      snippet.description || '',
      snippet.code,
      snippet.language,
      snippet.tags || []
    );
    
    console.log('[v0] Generated hash for snippet:', { id, onChainHash });
    
    // Submit hash to Stellar blockchain
    // In production, you would use the secret key from the request
    // For now, we use a mock transaction
    const secretKey = process.env.STELLAR_SECRET_KEY || '';
    
    const stellarResult = await submitHashToStellar(
      secretKey,
      onChainHash,
      id
    );
    
    if (!stellarResult.success) {
      return NextResponse.json(
        { error: 'Failed to submit hash to Stellar blockchain', details: stellarResult.error },
        { status: 500 }
      );
    }
    
    // Store the hash and transaction hash in the database
    // This ensures immutability - once stored, hashes cannot be altered
    const updatedSnippet = await storeSnippetHash(
      id,
      onChainHash,
      stellarResult.transactionHash!
    );
    
    return NextResponse.json({
      success: true,
      message: 'Snippet hash stored on Stellar blockchain',
      data: {
        snippetId: id,
        onChainHash,
        transactionHash: stellarResult.transactionHash,
        verifiedAt: updatedSnippet.verified_at
      }
    });
  } catch (error) {
    console.error('[v0] Error storing hash on blockchain:', error);
    return NextResponse.json(
      { error: 'Failed to store hash on blockchain' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/snippets/[id]/verify
 * Verify snippet integrity by comparing stored hash with current content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get the snippet with its on-chain hash
    const snippet = await getSnippetWithHash(id);
    
    if (!snippet) {
      return NextResponse.json(
        { error: 'Snippet not found' },
        { status: 404 }
      );
    }
    
    if (!snippet.on_chain_hash) {
      return NextResponse.json({
        verified: false,
        snippetId: id,
        message: 'This snippet has not been verified on the blockchain yet',
        onChainHash: null,
        transactionHash: null,
        verifiedAt: null
      });
    }
    
    // Verify integrity by comparing current content with stored hash
    const result = await verifySnippetIntegrity(
      id,
      snippet.title,
      snippet.description || '',
      snippet.code,
      snippet.language,
      snippet.tags || []
    );
    
    return NextResponse.json({
      verified: result.isValid,
      snippetId: id,
      message: result.message,
      onChainHash: snippet.on_chain_hash,
      transactionHash: snippet.transaction_hash,
      verifiedAt: snippet.verified_at
    });
  } catch (error) {
    console.error('[v0] Error verifying snippet:', error);
    return NextResponse.json(
      { error: 'Failed to verify snippet integrity' },
      { status: 500 }
    );
  }
}