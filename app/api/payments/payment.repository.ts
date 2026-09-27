import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { Payment, PaymentStatus, CreatePaymentRequest } from '@/lib/payment.types';

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    sql = neon(process.env.DATABASE_URL!);
  }
  return sql;
}

export class PaymentRepository {
  async createPayment(data: CreatePaymentRequest): Promise<Payment> {
    const id = crypto.randomUUID();
    const paymentId = `pm_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = data.expiresInMinutes
      ? new Date(Date.now() + data.expiresInMinutes * 60000)
      : new Date(Date.now() + 30 * 60000);

    const result = await getSql()`
      INSERT INTO payments (
        id, payment_id, snippet_id, asset_code, amount,
        sender_wallet, receiver_wallet, status, idempotency_key,
        memo, metadata, expires_at
      ) VALUES (
        ${id}, ${paymentId}, ${data.snippetId || null}, ${data.assetCode}, ${data.amount},
        ${data.senderWallet}, ${data.receiverWallet}, 'pending', ${data.idempotencyKey},
        ${data.memo || null}, ${JSON.stringify(data.metadata || {})}, ${expiresAt}
      )
      RETURNING *
    `;

    return this.mapToPayment(result[0]);
  }

  async getPaymentByPaymentId(paymentId: string): Promise<Payment | null> {
    const result = await getSql()`
      SELECT * FROM payments WHERE payment_id = ${paymentId}
    `;
    return result[0] ? this.mapToPayment(result[0]) : null;
  }

  async getPaymentByTransactionHash(txHash: string): Promise<Payment | null> {
    const result = await getSql()`
      SELECT * FROM payments WHERE transaction_hash = ${txHash}
    `;
    return result[0] ? this.mapToPayment(result[0]) : null;
  }

  async getPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    const result = await getSql()`
      SELECT * FROM payments WHERE idempotency_key = ${key}
    `;
    return result[0] ? this.mapToPayment(result[0]) : null;
  }

  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    transactionHash?: string,
    confirmedAt?: Date
  ): Promise<Payment | null> {
    const values: any[] = [paymentId];
    const updates: string[] = [];

    if (status) {
      updates.push(`status = $${values.length + 1}`);
      values.push(status);
    }

    if (transactionHash) {
      updates.push(`transaction_hash = $${values.length + 1}`);
      values.push(transactionHash);
    }

    if (confirmedAt) {
      updates.push(`confirmed_at = $${values.length + 1}`);
      values.push(confirmedAt);
    }

    if (status === 'successful' && !confirmedAt) {
      updates.push(`confirmed_at = NOW()`);
    }

    const query = `
      UPDATE payments
      SET ${updates.join(', ')}
      WHERE payment_id = $1
      RETURNING *
    `;

    const result = await getSql()(query, ...values);
    return result[0] ? this.mapToPayment(result[0]) : null;
  }

  async getPaymentsByWallet(walletAddress: string, limit: number = 50): Promise<Payment[]> {
    const result = await getSql()`
      SELECT * FROM payments
      WHERE sender_wallet = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return result.map((row: any) => this.mapToPayment(row));
  }

  async getPendingPayments(): Promise<Payment[]> {
    const result = await getSql()`
      SELECT * FROM payments
      WHERE status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at ASC
    `;
    return result.map((row: any) => this.mapToPayment(row));
  }

  async expireOldPayments(): Promise<number> {
    const result = await getSql()`
      UPDATE payments
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at < NOW()
      RETURNING id
    `;
    return result.length;
  }

  private mapToPayment(row: any): Payment {
    return {
      id: row.id,
      paymentId: row.payment_id,
      transactionHash: row.transaction_hash,
      snippetId: row.snippet_id,
      assetCode: row.asset_code,
      amount: parseFloat(row.amount),
      senderWallet: row.sender_wallet,
      receiverWallet: row.receiver_wallet,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      memo: row.memo,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at,
      expiresAt: row.expires_at,
    };
  }
}
