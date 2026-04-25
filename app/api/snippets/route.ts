import { NextRequest, NextResponse } from 'next/server';
import { getSnippets, createSnippet, getSnippetsByMultipleTags } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tagsParam = searchParams.get('tags');
    const matchAll = searchParams.get('matchAll') === 'true';
    
    let snippets;
    if (tagsParam) {
      // Import the new function
      const { getSnippetsByMultipleTags } = await import('@/lib/db');
      const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      snippets = await getSnippetsByMultipleTags(tags, matchAll);
    } else {
      snippets = await getSnippets();
    }
    
    return NextResponse.json(snippets);
  } catch (error) {
    console.error('[v0] Error fetching snippets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snippets' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, code, language, tags } = body;

    if (!title || !description || !code || !language || !tags || tags.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, code, language, tags' },
        { status: 400 }
      );
    }

    const snippet = await createSnippet(
      title,
      description,
      code,
      language,
      tags
    );

    return NextResponse.json(snippet, { status: 201 });
  } catch (error) {
    console.error('[v0] Error creating snippet:', error);
    return NextResponse.json(
      { error: 'Failed to create snippet' },
      { status: 500 }
    );
  }
}
