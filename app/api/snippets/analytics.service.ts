import { AnalyticsRepository, CreateAnalyticsDTO, ActionType } from "./analytics.repository";

// Simple delay function for exponential backoff
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AnalyticsService {
  private repository: AnalyticsRepository;

  constructor(repository = new AnalyticsRepository()) {
    this.repository = repository;
  }

  /**
   * Logs a snippet action with retry logic to ensure no data loss.
   * Retries up to specified maxRetries with exponential backoff.
   */
  async logAction(data: CreateAnalyticsDTO, maxRetries = 3): Promise<any> {
    // Validate actionType early
    const validActions: ActionType[] = ["view", "copy", "share"];
    if (!validActions.includes(data.actionType)) {
      throw new Error(`Invalid action type: ${data.actionType}. Must be one of: view, copy, share.`);
    }

    let attempt = 0;
    let lastError: any;

    while (attempt < maxRetries) {
      try {
        return await this.repository.logAction(data);
      } catch (error) {
        attempt++;
        lastError = error;
        console.error(`[AnalyticsService] Failed to log action (attempt ${attempt}/${maxRetries}):`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 500ms, 1000ms, ...
          await delay(500 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw new Error(`Failed to log analytics action after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  async getSnippetAggregations(snippetId: string) {
    if (!snippetId) throw new Error("Snippet ID is required");
    
    const aggregations = await this.repository.getSnippetAggregations(snippetId);
    
    // Format output to guarantee all keys exist even if 0
    const result = {
      views: 0,
      copies: 0,
      shares: 0,
    };
    
    for (const agg of aggregations) {
      if (agg.action_type === "view") result.views = agg.count;
      else if (agg.action_type === "copy") result.copies = agg.count;
      else if (agg.action_type === "share") result.shares = agg.count;
    }
    
    return result;
  }

  async getGlobalAggregations() {
    const aggregations = await this.repository.getGlobalAggregations();
    
    const result = {
      views: 0,
      copies: 0,
      shares: 0,
    };
    
    for (const agg of aggregations) {
      if (agg.action_type === "view") result.views = agg.count;
      else if (agg.action_type === "copy") result.copies = agg.count;
      else if (agg.action_type === "share") result.shares = agg.count;
    }
    
    return result;
  }
}
