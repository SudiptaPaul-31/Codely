import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '../payment.service';

const paymentService = new PaymentService();

export async function GET(
  req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const walletAddress = req.headers.get('x-wallet-address');
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 401 }
      );
    }

    const { paymentId } = await params;

    const status = await paymentService.getPaymentStatus(paymentId);

    if (!status) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(status);

  } catch (error: any) {
    console.error('[payments/:id] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment status' },
      { status: 500 }
    );
  }
}
