import * as StellarSdk from 'stellar-sdk';
import { PaymentRepository } from './payment.repository';
import { CreatePaymentRequest, VerifyPaymentRequest, PaymentStatus } from '@/lib/payment.types';
import { createTransaction } from '@/lib/db';

const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET;

export class PaymentService {
  private repository: PaymentRepository;

  constructor() {
    this.repository = new PaymentRepository();
  }

  async createPayment(data: CreatePaymentRequest) {
    // Check idempotency
    const existing = await this.repository.getPaymentByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return existing;
    }

    // Create payment
    const payment = await this.repository.createPayment(data);

    // Log transaction
    await createTransaction(
      data.senderWallet,
      'payment_created',
      `Payment ${payment.paymentId} created for ${data.assetCode} ${data.amount}`,
      { paymentId: payment.paymentId, assetCode: data.assetCode, amount: data.amount }
    );

    return payment;
  }

  async verifyPayment(request: VerifyPaymentRequest) {
    const { transactionHash, expectedAmount, expectedAssetCode, expectedSenderWallet, expectedReceiverWallet } = request;

    // Check if already processed
    const existing = await this.repository.getPaymentByTransactionHash(transactionHash);
    if (existing && existing.status === 'successful') {
      return { verified: true, payment: existing };
    }

    // Query Stellar transaction
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    let transaction: any;

    try {
      const response = await server.transactions().transaction(transactionHash).call();
      transaction = response;
    } catch (error: any) {
      return {
        verified: false,
        error: 'Transaction not found on Stellar network',
        details: error?.message
      };
    }

    // Verify transaction details
    const sourceAccount = transaction.source_account;
    const amount = parseFloat(transaction.amount) || 0;
    const assetCode = transaction.asset_code || 'XLM';
    const destinationAccount = transaction.destination_account;

    // Validate
    const errors: string[] = [];

    if (sourceAccount !== expectedSenderWallet) {
      errors.push(`Sender mismatch: expected ${expectedSenderWallet}, got ${sourceAccount}`);
    }

    if (amount !== expectedAmount) {
      errors.push(`Amount mismatch: expected ${expectedAmount}, got ${amount}`);
    }

    if (assetCode !== expectedAssetCode) {
      errors.push(`Asset mismatch: expected ${expectedAssetCode}, got ${assetCode}`);
    }

    if (destinationAccount && destinationAccount !== expectedReceiverWallet) {
      errors.push(`Receiver mismatch: expected ${expectedReceiverWallet}, got ${destinationAccount}`);
    }

    if (errors.length > 0) {
      // Log failed verification
      await createTransaction(
        expectedSenderWallet,
        'payment_verification_failed',
        `Payment verification failed for ${transactionHash}`,
        { errors, transactionHash }
      );
      
      return { verified: false, errors };
    }

    // Find and update payment
    let payment = await this.repository.getPaymentByTransactionHash(transactionHash);
    
    if (!payment) {
      // Try to find by idempotency key or create a new one
      const idempotencyKey = `tx_${transactionHash.slice(0, 16)}`;
      const existingByIdempotency = await this.repository.getPaymentByIdempotencyKey(idempotencyKey);
      
      if (existingByIdempotency) {
        payment = await this.repository.updatePaymentStatus(
          existingByIdempotency.paymentId,
          'successful',
          transactionHash,
          new Date()
        );
      } else {
        // Create payment record from transaction
        const createData: CreatePaymentRequest = {
          assetCode: expectedAssetCode,
          amount: expectedAmount,
          senderWallet: expectedSenderWallet,
          receiverWallet: expectedReceiverWallet,
          idempotencyKey: idempotencyKey,
          metadata: { verified: true, transactionHash },
        };
        payment = await this.createPayment(createData);
        payment = await this.repository.updatePaymentStatus(
          payment.paymentId,
          'successful',
          transactionHash,
          new Date()
        );
      }
    } else {
      payment = await this.repository.updatePaymentStatus(
        payment.paymentId,
        'successful',
        transactionHash,
        new Date()
      );
    }

    // Log successful verification
    await createTransaction(
      expectedSenderWallet,
      'payment_verified',
      `Payment ${payment?.paymentId} verified successfully`,
      { transactionHash, paymentId: payment?.paymentId }
    );

    return { verified: true, payment };
  }

  async getPaymentStatus(paymentId: string) {
    const payment = await this.repository.getPaymentByPaymentId(paymentId);
    if (!payment) {
      return null;
    }

    return {
      paymentId: payment.paymentId,
      status: payment.status,
      transactionHash: payment.transactionHash,
      confirmedAt: payment.confirmedAt,
      expiresAt: payment.expiresAt,
    };
  }

  async expirePendingPayments() {
    const count = await this.repository.expireOldPayments();
    return { expired: count };
  }
}
