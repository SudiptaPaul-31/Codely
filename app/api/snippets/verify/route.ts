import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedSnippets } from '@/lib/db';
import { generateBatchHash } from '@/lib/hash';
import { submitBatchHashToStellar } from '@/lib/stellar';

/**
 * POST /api/snippets/verify
 * Batch verify multiple snippets by storing their hashes on Stellar
 * This is more efficient than verifying one at a time
 * 
 * Body: { snippetIds: string[], secretKey?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { snippetIds, secretKey } = body;
    
    if (!snippetIds || !Array.isArray(snippetIds) || snippetIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: snippetIds array is required' },
        { status: 400 }
      );
    }
    
    // Get all snippets to generate hashes
    const { getSnippetById } = await import('@/lib/db');
    const { generateSnippetHash } = await import('@/lib/hash');
    
    const snippetsWithHashes = [];
    const errors = [];
    
    for (const snippetId of snippetIds) {
      try {
        const snippet = await getSnippetById(snippetId);
        if (snippet) {
          const hash = generateSnippetHash(
            snippet.title,
            snippet.description || '',
            snippet.code,
            snippet.language,
            snippet.tags || []
          );
          snippetsWithHashes.push({ id: snippetId, hash });
        } else {
          errors.push({ id: snippetId, error: 'Snippet not found' });
        }
      } catch (err) {
        errors.push({ id: snippetId, error: 'Failed to generate hash' });
      }
    }
    
    if (snippetsWithHashes.length === 0) {
      return NextResponse.json(
        { error: 'No valid snippets found', errors },
        { status: 400 }
      );
    }
    
    // Submit batch hash to Stellar
    const stellarSecretKey = secretKey || process.env.STELLAR_SECRET_KEY || '';
    const stellarResult = await submitBatchHashToStellar(
      stellarSecretKey,
      snippetsWithHashes
    );
    
    if (!stellarResult.success) {
      return NextResponse.json(
        { error: 'Failed to submit batch to Stellar blockchain', details: stellarResult.error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Verified ${snippetsWithHashes.length} snippets on Stellar blockchain`,
      data: {
        verifiedCount: snippetsWithHashes.length,
        transactionHash: stellarResult.transactionHash,
        batchHash: stellarResult.memo,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('[v0] Error batch verifying snippets:', error);
    return NextResponse.json(
      { error: 'Failed to batch verify snippets' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/snippets/verify
 * Get all verified snippets
 */
export async function GET() {
  try {
    const verifiedSnippets = await getVerifiedSnippets();
    
    return NextResponse.json({
      verifiedCount: verifiedSnippets.length,
      snippets: verifiedSnippets.map(s => ({
        id: s.id,
        title: s.title,
        onChainHash: s.on_chain_hash,
        transactionHash: s.transaction_hash,
        verifiedAt: s.verified_at
      }))
    });
  } catch (error) {
    console.error('[v0] Error fetching verified snippets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verified snippets' },
      { status: 500 }
    );
  }
}