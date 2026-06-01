import { NextRequest, NextResponse } from 'next/server';
import { getSnippetById } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const snippet = await getSnippetById(id);

    if (!snippet) {
      return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
    }

    if (!snippet.nft_transaction_hash) {
      return NextResponse.json(
        { error: 'NFT not found for this snippet', status: 'not_minted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      txHash: snippet.nft_transaction_hash,
      metadata: snippet.nft_metadata,
      status: 'minted',
    });
  } catch (error) {
    console.error('[v0] Error fetching snippet NFT:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snippet NFT' },
      { status: 500 }
    );
  }
}