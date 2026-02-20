import { NextRequest, NextResponse } from 'next/server';
import { getSnippetById, updateSnippet, deleteSnippet } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const snippet = await getSnippetById(id);

    if (!snippet) {
      return NextResponse.json(
        { error: 'Snippet not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(snippet);
  } catch (error) {
    console.error('[v0] Error fetching snippet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snippet' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, description, code, language, tags } = body;

    if (!title || !description || !code || !language || !tags || tags.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, code, language, tags' },
        { status: 400 }
      );
    }

    const snippet = await updateSnippet(
      id,
      title,
      description,
      code,
      language,
      tags
    );

    return NextResponse.json(snippet);
  } catch (error) {
    console.error('[v0] Error updating snippet:', error);
    return NextResponse.json(
      { error: 'Failed to update snippet' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSnippet(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[v0] Error deleting snippet:', error);
    return NextResponse.json(
      { error: 'Failed to delete snippet' },
      { status: 500 }
    );
  }
}
