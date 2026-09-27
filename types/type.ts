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

// Snippet Interface
export interface Snippet {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  owner_wallet_address: string | null;
  forked_from_id?: string | null;
  is_fork?: boolean;
  license_type?: string | null;
  license_transaction_hash?: string | null;
  license_metadata?: any;
  ipfs_cid?: string | null;
  created_at: string;
  updated_at: string;
}

// Snippet summary with derivation reference
export interface SnippetSummary {
  id: string;
  title: string;
  language: string;
  description?: string;
  tags?: string[];
  owner_wallet_address?: string | null;
  forked_from_id?: string | null;
  is_fork?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Fork and Duplicate DTOs
export interface ForkSnippetDTO {
  title?: string;
  description?: string;
  code?: string;
  language?: string;
  tags?: string[];
  licenseType?: string;
}

export interface DuplicateSnippetDTO {
  title?: string;
}

export interface SnippetDerivationInfo {
  isFork: boolean;
  forkedFromId: string | null;
  originSnippet?: SnippetSummary | null;
  forkCount?: number;
}
