import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '../payment.service';

const paymentService = new PaymentService();

export async function POST(req: NextRequest) {
  try {
    const walletAddress = req.headers.get('x-wallet-address');
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { transactionHash, expectedAmount, expectedAssetCode, expectedSenderWallet, expectedReceiverWallet } = body;

    // Validation
    if (!transactionHash) {
      return NextResponse.json(
        { error: 'transactionHash is required' },
        { status: 400 }
      );
    }

    if (!expectedAmount || expectedAmount <= 0) {
      return NextResponse.json(
        { error: 'expectedAmount must be greater than 0' },
        { status: 400 }
      );
    }

    if (!expectedAssetCode) {
      return NextResponse.json(
        { error: 'expectedAssetCode is required' },
        { status: 400 }
      );
    }

    if (!expectedSenderWallet) {
      return NextResponse.json(
        { error: 'expectedSenderWallet is required' },
        { status: 400 }
      );
    }

    if (!expectedReceiverWallet) {
      return NextResponse.json(
        { error: 'expectedReceiverWallet is required' },
        { status: 400 }
      );
    }

    const result = await paymentService.verifyPayment({
      transactionHash,
      expectedAmount,
      expectedAssetCode,
      expectedSenderWallet,
      expectedReceiverWallet,
    });

    if (!result.verified) {
      return NextResponse.json(
        { 
          verified: false, 
          errors: result.errors || [result.error || 'Verification failed'],
          transactionHash
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      verified: true,
      paymentId: result.payment?.paymentId,
      status: result.payment?.status,
      transactionHash,
      confirmedAt: result.payment?.confirmedAt,
    });

  } catch (error: any) {
    console.error('[payments/verify] POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
