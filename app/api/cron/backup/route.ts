import { NextResponse } from 'next/server';
import { createBackup } from '@/lib/backup.service';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    // Ensure the cron secret matches
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backupMetadata = await createBackup();

    return NextResponse.json({
      success: true,
      message: 'Backup created successfully',
      data: backupMetadata
    });
  } catch (error: any) {
    console.error('[Cron/Backup] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
