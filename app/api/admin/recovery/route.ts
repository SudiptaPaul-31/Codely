import { NextResponse } from 'next/server';
import { restoreBackup, listBackups } from '@/lib/backup.service';
import { logEvent } from "@/lib/audit";
import { estimateFee, validateTransaction, getNetworkFees } from '@/lib/stellar/fee-estimation.service';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    // Ensure the admin secret matches
    if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      await logEvent("admin_unauthorized_access", "UNKNOWN", undefined, "Failed admin recovery POST attempt");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, snippetIds, transaction } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // When a Stellar transaction accompanies the recovery, estimate fees and
    // validate the wallet balance before proceeding.
    if (transaction) {
      const feeEstimate = await estimateFee(transaction);
      if (fefEstimate.feeStatus === 'unable_to_estimate') {
        return NextResponse.json(
          { success: false, error: 'Unable to estimate network fee. Please retry.' },
          { status: 503 }
        );
      }

      const validation = await validateTransaction(transaction, feeEstimate);
      if (!validation.balanceSufficient) {
        return NextResponse.json(
          {
            success: false,
            error: 'Insufficient balance to cover transaction amount and network fee',
            data: { feeEstimate, validation }
          },
          { status: 400 }
        );
      }
    }

    const result = await restoreBackup(filename, snippetIds);
    await logEvent("admin_backup_restored", "SYSTEM_ADMIN", undefined, `Restored ${result.restoredCount} snippets from ${filename}`);

    return NextResponse.json({
      success: true,
      message: `Restored ${result.restoredCount} snippets successfully`,
      data: result
    });
  } catch (error: any) {
    console.error('[Admin/Recovery] Error:', error);
    await logEvent("admin_recovery_error", "SYSTEM_ADMIN", undefined, error.message);
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
      await logEvent("admin_unauthorized_access", "UNKNOWN", undefined, "Failed admin recovery GET attempt");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backups = listBackups();
    const networkFees = await getNetworkFees();
    await logEvent("admin_backups_listed", "SYSTEM_ADMIN", undefined, "Admin accessed backup list");

    return NextResponse.json({
      success: true,
      data: backups,
      networkFees
    });
  } catch (error: any) {
    console.error('[Admin/Recovery] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    },
      { status: 500 }
    );
  }
}
