import { BlockchainSyncRepository } from "./blockchain-sync.repository";
import { BlockchainEventListenerRepository } from "./blockchain-event-listener.repository";

export class BlockchainSyncService {
  constructor(
    private readonly syncRepo = new BlockchainSyncRepository(),
    private readonly eventRepo = new BlockchainEventListenerRepository()
  ) {}

  /**
   * Fetches the latest on-chain state for a snippet.
   * Includes a retry mechanism for transient network failures.
   */
  async fetchBlockchainState(snippetId: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        // In a real scenario, this queries Stellar Horizon for the latest transaction
        // referencing the snippetId. 
        // We mock the network call for illustration.
        await new Promise(res => setTimeout(res, 100)); // Simulate network latency

        // Mock response
        return {
          owner: "mock-onchain-owner-wallet",
          timestamp: new Date().toISOString(),
          transactionHash: "mock-tx-hash",
          isAuthoritative: true
        };
      } catch (error) {
        if (i === retries - 1) {
          console.error(`[BlockchainSyncService] Permanent failure fetching state for ${snippetId}`, error);
          throw error;
        }
        console.warn(`[BlockchainSyncService] Transient failure fetching state for ${snippetId}. Retrying...`);
        await new Promise(res => setTimeout(res, 500 * (i + 1))); // Exponential backoff
      }
    }
  }

  async runSyncJob(): Promise<void> {
    console.log("[BlockchainSyncService] Starting sync job...");
    const snippets = await this.syncRepo.getAllSnippets();

    for (const snippet of snippets) {
      try {
        await this.reconcileSnippet(snippet);
      } catch (error) {
        console.error(`[BlockchainSyncService] Failed to reconcile snippet ${snippet.id}:`, error);
        // Log permanent failure or just continue to be resilient
      }
    }
    console.log("[BlockchainSyncService] Sync job completed.");
  }

  async reconcileSnippet(snippet: any): Promise<void> {
    const onChainState = await this.fetchBlockchainState(snippet.id);
    if (!onChainState) return;

    // Detect discrepancy
    if (snippet.owner !== onChainState.owner) {
      const dbUpdatedAt = new Date(snippet.updated_at).getTime();
      const onChainUpdatedAt = new Date(onChainState.timestamp).getTime();

      let resolution = "";

      if (onChainUpdatedAt > dbUpdatedAt && onChainState.isAuthoritative) {
        // Safe reconciliation: on-chain data is newer and authoritative
        await this.syncRepo.updateSnippetOwner(snippet.id, onChainState.owner, new Date(onChainState.timestamp));
        resolution = "UPDATED_DB";
      } else {
        // Do not overwrite newer application state
        resolution = "PRESERVED_APP_STATE";
      }

      await this.syncRepo.logSyncDiscrepancy({
        snippetId: snippet.id,
        transactionHash: onChainState.transactionHash,
        discrepancyType: "OWNERSHIP_MISMATCH",
        resolution
      });
      
      console.log(`[BlockchainSyncService] Discrepancy resolved for ${snippet.id}: ${resolution}`);
    }
  }
}
