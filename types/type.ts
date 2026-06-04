import { snippetSchema } from "@/validiation/snippet-form-validiation";
import * as z from "zod";
import type { ActivityAction, ResourceType } from "@/lib/activity-logger";

export type SnippetFormValues = z.infer<typeof snippetSchema>;

// Snippet version types
export interface SnippetVersion {
  id: string;
  snippet_id: string;
  content: {
    title: string;
    description: string;
    code: string;
    language: string;
    tags: string[];
  };
  editor_id: string | null;
  version_number: number;
  created_at: string;
}

// Version history response
export interface VersionHistory {
  versions: SnippetVersion[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// Activity Logging Types
// ============================================================

/** A single immutable activity log record as stored in PostgreSQL */
export interface ActivityLog {
  id: string;
  actor_wallet: string | null;
  action: ActivityAction;
  resource_type: ResourceType;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string; // ISO 8601 timestamp
}

/** Paginated response from GET /api/logs */
export interface ActivityLogsResponse {
  data: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

