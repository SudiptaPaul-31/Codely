import { NextResponse } from 'next/server';
import { restoreBackup, listBackups } from '@/lib/backup.service';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    // Ensure the admin secret matches
    if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, snippetIds } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    const result = await restoreBackup(filename, snippetIds);

    return NextResponse.json({
      success: true,
      message: `Restored ${result.restoredCount} snippets successfully`,
      data: result
    });
  } catch (error: any) {
    console.error('[Admin/Recovery] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backups = listBackups();

    return NextResponse.json({
      success: true,
      data: backups
    });
  } catch (error: any) {
    console.error('[Admin/Recovery] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
