import { NextRequest, NextResponse } from 'next/server';
import { SnippetService } from '../snippet.service';
import { SnippetRepository } from '../snippet.repository';
import { storeOnIPFS, retrieveFromIPFS } from '@/lib/ipfs';

const snippetRepository = new SnippetRepository();
const snippetService = new SnippetService(snippetRepository);

// Store content on IPFS
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const cid = await storeOnIPFS(content);

    return NextResponse.json({
      success: true,
      cid,
    });
  } catch (error) {
    console.error('[API] Error storing content on IPFS:', error);
    return NextResponse.json(
      { error: 'Failed to store content on IPFS' },
      { status: 500 }
    );
  }
}

// Retrieve content from IPFS
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cid = searchParams.get('cid');

    if (!cid) {
      return NextResponse.json(
        { error: 'CID is required' },
        { status: 400 }
      );
    }

    const content = await retrieveFromIPFS(cid);

    // Also try to get the snippet from database if it exists
    let snippet = null;
    try {
      snippet = await snippetService.getSnippetByIpfsCid(cid);
    } catch (err) {
      // Snippet not found in database is okay
    }

    return NextResponse.json({
      success: true,
      cid,
      content,
      snippet,
    });
  } catch (error) {
    console.error('[API] Error retrieving content from IPFS:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve content from IPFS' },
      { status: 500 }
    );
  }
}
