import { NextRequest, NextResponse } from 'next/server';
import { getSnippetById, updateSnippetNft } from '@/lib/db';
import { mintSnippetNFT } from '@/lib/stellar';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const snippet = await getSnippetById(id);

    if (!snippet) {
      return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
    }

    if (snippet.nft_transaction_hash) {
      return NextResponse.json(
        {
          message: 'Snippet already minted as NFT',
          txHash: snippet.nft_transaction_hash,
          metadata: snippet.nft_metadata,
        },
        { status: 200 }
      );
    }

    const result = await mintSnippetNFT({
      title: snippet.title,
      language: snippet.language,
      code: snippet.code,
    });

    const updatedSnippet = await updateSnippetNft(
      id,
      result.txHash,
      result.metadata
    );

    return NextResponse.json({
      message: 'NFT minted successfully',
      txHash: result.txHash,
      metadata: result.metadata,
      snippet: updatedSnippet,
    });
  } catch (error) {
    console.error('[v0] Error minting snippet NFT:', error);
    return NextResponse.json(
      { error: 'Failed to mint snippet NFT' },
      { status: 500 }
    );
  }
}