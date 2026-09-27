export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'expired';

export interface Payment {
  id: string;
  paymentId: string;
  transactionHash: string | null;
  snippetId: string | null;
  assetCode: string;
  amount: number;
  senderWallet: string;
  receiverWallet: string;
  status: PaymentStatus;
  idempotencyKey: string;
  memo: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  expiresAt: Date | null;
}

export interface CreatePaymentRequest {
  snippetId?: string;
  assetCode: string;
  amount: number;
  senderWallet: string;
  receiverWallet: string;
  idempotencyKey: string;
  memo?: string;
  metadata?: Record<string, any>;
  expiresInMinutes?: number;
}

export interface VerifyPaymentRequest {
  transactionHash: string;
  expectedAmount: number;
  expectedAssetCode: string;
  expectedSenderWallet: string;
  expectedReceiverWallet: string;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  transactionHash: string | null;
  confirmedAt: Date | null;
  expiresAt: Date | null;
}
