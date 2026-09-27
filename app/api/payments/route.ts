import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from './payment.service';
import { CreatePaymentRequest } from '@/lib/payment.types';

const paymentService = new PaymentService();

export async function POST(req: NextRequest) {
  try {
    const walletAddress = req.headers.get('x-wallet-address');
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required in x-wallet-address header' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { snippetId, assetCode, amount, idempotencyKey, memo, metadata, expiresInMinutes } = body;

    // Validation
    if (!assetCode) {
      return NextResponse.json(
        { error: 'assetCode is required (e.g., XLM, USDC)' },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'idempotencyKey is required to prevent duplicates' },
        { status: 400 }
      );
    }

    const paymentData: CreatePaymentRequest = {
      snippetId,
      assetCode,
      amount,
      senderWallet: walletAddress,
      receiverWallet: process.env.STELLAR_RECEIVER_WALLET || walletAddress,
      idempotencyKey,
      memo,
      metadata,
      expiresInMinutes,
    };

    const payment = await paymentService.createPayment(paymentData);

    return NextResponse.json({
      paymentId: payment.paymentId,
      status: payment.status,
      assetCode: payment.assetCode,
      amount: payment.amount,
      senderWallet: payment.senderWallet,
      receiverWallet: payment.receiverWallet,
      expiresAt: payment.expiresAt,
      createdAt: payment.createdAt,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[payments] POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create payment' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const walletAddress = req.headers.get('x-wallet-address');
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const payments = await paymentService['repository'].getPaymentsByWallet(walletAddress, limit);

    return NextResponse.json({
      wallet: walletAddress,
      payments: payments.map(p => ({
        paymentId: p.paymentId,
        status: p.status,
        assetCode: p.assetCode,
        amount: p.amount,
        transactionHash: p.transactionHash,
        createdAt: p.createdAt,
        confirmedAt: p.confirmedAt,
      })),
      count: payments.length,
    });

  } catch (error: any) {
    console.error('[payments] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
