import { neon } from "@neondatabase/serverless";
import type {
  MarketplaceListing,
  MarketplacePurchase,
  MarketplaceEscrow,
  MarketplaceAuditLog,
  CreateListingInput,
} from "./marketplace.types";

const sql = neon(process.env.DATABASE_URL!);

// ── Listings ──────────────────────────────────────────────────────────────────

export async function createListing(
  input: CreateListingInput,
  onChainTx?: string,
): Promise<MarketplaceListing> {
  const result = await sql`
    INSERT INTO marketplace_listings
      (snippet_id, seller_wallet, price_xlm, title, description, on_chain_listing_tx)
    VALUES
      (${input.snippet_id}, ${input.seller_wallet}, ${input.price_xlm},
       ${input.title}, ${input.description ?? null}, ${onChainTx ?? null})
    RETURNING *
  `;
  return result[0] as MarketplaceListing;
}

export async function getListings(
  status = "active",
  limit = 20,
  offset = 0,
): Promise<MarketplaceListing[]> {
  const result = await sql`
    SELECT * FROM marketplace_listings
    WHERE status = ${status}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return result as MarketplaceListing[];
}

export async function getListingById(id: string): Promise<MarketplaceListing | null> {
  const result = await sql`
    SELECT * FROM marketplace_listings WHERE id = ${id}
  `;
  return (result[0] as MarketplaceListing) ?? null;
}

export async function updateListingStatus(
  id: string,
  status: MarketplaceListing["status"],
): Promise<void> {
  await sql`
    UPDATE marketplace_listings
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

// ── Purchases ─────────────────────────────────────────────────────────────────

export async function createPurchase(
  listingId: string,
  buyerWallet: string,
  sellerWallet: string,
  priceXlm: number,
  escrowTxHash?: string,
): Promise<MarketplacePurchase> {
  const result = await sql`
    INSERT INTO marketplace_purchases
      (listing_id, buyer_wallet, seller_wallet, price_xlm, escrow_tx_hash, status)
    VALUES
      (${listingId}, ${buyerWallet}, ${sellerWallet}, ${priceXlm},
       ${escrowTxHash ?? null}, 'escrowed')
    RETURNING *
  `;
  return result[0] as MarketplacePurchase;
}

export async function completePurchase(
  purchaseId: string,
  releaseTxHash: string,
): Promise<MarketplacePurchase> {
  const result = await sql`
    UPDATE marketplace_purchases
    SET status = 'completed', release_tx_hash = ${releaseTxHash}, completed_at = NOW()
    WHERE id = ${purchaseId}
    RETURNING *
  `;
  return result[0] as MarketplacePurchase;
}

export async function getPurchasesByBuyer(
  buyerWallet: string,
): Promise<MarketplacePurchase[]> {
  const result = await sql`
    SELECT * FROM marketplace_purchases
    WHERE buyer_wallet = ${buyerWallet}
    ORDER BY purchased_at DESC
  `;
  return result as MarketplacePurchase[];
}

export async function getPurchaseByListingAndBuyer(
  listingId: string,
  buyerWallet: string,
): Promise<MarketplacePurchase | null> {
  const result = await sql`
    SELECT * FROM marketplace_purchases
    WHERE listing_id = ${listingId} AND buyer_wallet = ${buyerWallet}
      AND status = 'completed'
    LIMIT 1
  `;
  return (result[0] as MarketplacePurchase) ?? null;
}

// ── Escrow ────────────────────────────────────────────────────────────────────

export async function createEscrowRecord(
  purchaseId: string,
  escrowAccount: string,
  amountXlm: number,
  lockTxHash?: string,
): Promise<MarketplaceEscrow> {
  const result = await sql`
    INSERT INTO marketplace_escrow
      (purchase_id, escrow_account, amount_xlm, lock_tx_hash, status)
    VALUES
      (${purchaseId}, ${escrowAccount}, ${amountXlm}, ${lockTxHash ?? null}, 'locked')
    RETURNING *
  `;
  return result[0] as MarketplaceEscrow;
}

export async function releaseEscrow(
  purchaseId: string,
  releaseTxHash: string,
): Promise<void> {
  await sql`
    UPDATE marketplace_escrow
    SET status = 'released', release_tx_hash = ${releaseTxHash}, released_at = NOW()
    WHERE purchase_id = ${purchaseId}
  `;
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export async function createAuditLog(
  entityType: string,
  entityId: string,
  action: string,
  actorWallet: string | null,
  details: Record<string, unknown> = {},
  txHash?: string,
): Promise<MarketplaceAuditLog> {
  const result = await sql`
    INSERT INTO marketplace_audit_logs
      (entity_type, entity_id, action, actor_wallet, details, tx_hash)
    VALUES
      (${entityType}, ${entityId}, ${action}, ${actorWallet},
       ${JSON.stringify(details)}, ${txHash ?? null})
    RETURNING *
  `;
  return result[0] as MarketplaceAuditLog;
}

export async function getAuditLogs(
  entityType?: string,
  entityId?: string,
  limit = 50,
  offset = 0,
): Promise<MarketplaceAuditLog[]> {
  if (entityType && entityId) {
    const result = await sql`
      SELECT * FROM marketplace_audit_logs
      WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as MarketplaceAuditLog[];
  }
  if (entityType) {
    const result = await sql`
      SELECT * FROM marketplace_audit_logs
      WHERE entity_type = ${entityType}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as MarketplaceAuditLog[];
  }
  const result = await sql`
    SELECT * FROM marketplace_audit_logs
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return result as MarketplaceAuditLog[];
}
