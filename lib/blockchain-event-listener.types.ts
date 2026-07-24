export type BlockchainEventType =
  | "ownership.updated"
  | "snippet.transferred"
  | "verification.wallet"
  | "verification.snippet"
  | "permission.granted"
  | "permission.revoked";

export type EventLogStatus =
  | "pending"
  | "processing"
  | "processed"
  | "retrying"
  | "failed"
  | "ignored";

export type PermissionType = "view" | "edit";

export interface BlockchainEvent {
  id: string;
  type: string;
  timestamp: string;
  cursor?: string | null;
  txHash?: string | null;
  contractId?: string | null;
  ledger?: number | null;
  snippetId?: string | null;
  walletAddress?: string | null;
  previousOwnerWalletAddress?: string | null;
  newOwnerWalletAddress?: string | null;
  actorWalletAddress?: string | null;
  targetWalletAddress?: string | null;
  permissionType?: PermissionType | null;
  signature?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StoredBlockchainEvent extends BlockchainEvent {
  status: EventLogStatus;
  attempts: number;
  source?: string | null;
  lastError?: string | null;
}

export interface BlockchainEventBatch {
  events: BlockchainEvent[];
  nextCursor?: string | null;
  source?: string | null;
}

export interface BlockchainEventSource {
  fetchEvents(params: {
    cursor?: string | null;
    limit: number;
  }): Promise<BlockchainEventBatch>;
}
