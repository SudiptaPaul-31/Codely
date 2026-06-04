export type ListingStatus = "active" | "sold" | "cancelled";
export type PurchaseStatus = "pending" | "escrowed" | "completed" | "refunded";
export type EscrowStatus = "locked" | "released" | "refunded";

export interface MarketplaceListing {
  id: string;
  snippet_id: string;
  seller_wallet: string;
  price_xlm: number;
  title: string;
  description: string | null;
  status: ListingStatus;
  on_chain_listing_tx: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplacePurchase {
  id: string;
  listing_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  price_xlm: number;
  escrow_tx_hash: string | null;
  release_tx_hash: string | null;
  status: PurchaseStatus;
  purchased_at: string;
  completed_at: string | null;
}

export interface MarketplaceEscrow {
  id: string;
  purchase_id: string;
  escrow_account: string;
  amount_xlm: number;
  lock_tx_hash: string | null;
  release_tx_hash: string | null;
  status: EscrowStatus;
  created_at: string;
  released_at: string | null;
}

export interface MarketplaceAuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_wallet: string | null;
  details: Record<string, unknown>;
  tx_hash: string | null;
  created_at: string;
}

export interface CreateListingInput {
  snippet_id: string;
  seller_wallet: string;
  price_xlm: number;
  title: string;
  description?: string;
}

export interface PurchaseListingInput {
  buyer_wallet: string;
  buyer_signature: string; // signed message proving wallet ownership
}

export interface OwnershipVerification {
  listing_id: string;
  snippet_id: string;
  owner_wallet: string;
  purchase_id: string;
  tx_hash: string | null;
  verified: boolean;
  verified_at: string;
}
