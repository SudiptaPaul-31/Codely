import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);

export type PermissionType = "view" | "edit";
export type PermissionAction = "grant" | "revoke";

export interface SnippetPermission {
  id: string;
  snippet_id: string;
  grantee_wallet_address: string;
  permission_type: PermissionType;
  granted_by_wallet_address: string;
  on_chain_tx_hash: string | null;
  granted_at: string;
  revoked_at: string | null;
  is_active: boolean;
}

export interface PermissionActivityLog {
  id: string;
  snippet_id: string;
  actor_wallet_address: string;
  target_wallet_address: string;
  action: PermissionAction;
  permission_type: PermissionType;
  on_chain_tx_hash: string | null;
  created_at: string;
}

/**
 * Generates a deterministic on-chain anchor hash for a permission record.
 * In production this would be a real Stellar transaction hash.
 */
function generateOnChainHash(
  snippetId: string,
  grantee: string,
  permissionType: PermissionType,
  timestamp: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${snippetId}:${grantee}:${permissionType}:${timestamp}`)
    .digest("hex");
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getPermissionsForSnippet(
  snippetId: string,
): Promise<SnippetPermission[]> {
  const result = await sql`
    SELECT * FROM snippet_permissions
    WHERE snippet_id = ${snippetId} AND is_active = true
    ORDER BY granted_at DESC
  `;
  return result as SnippetPermission[];
}

export async function getPermissionForWallet(
  snippetId: string,
  walletAddress: string,
): Promise<SnippetPermission[]> {
  const result = await sql`
    SELECT * FROM snippet_permissions
    WHERE snippet_id = ${snippetId}
      AND grantee_wallet_address = ${walletAddress}
      AND is_active = true
  `;
  return result as SnippetPermission[];
}

export async function hasPermission(
  snippetId: string,
  walletAddress: string,
  permissionType: PermissionType,
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM snippet_permissions
    WHERE snippet_id = ${snippetId}
      AND grantee_wallet_address = ${walletAddress}
      AND permission_type = ${permissionType}
      AND is_active = true
    LIMIT 1
  `;
  return result.length > 0;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function grantPermission(
  snippetId: string,
  granteeWallet: string,
  permissionType: PermissionType,
  grantorWallet: string,
): Promise<SnippetPermission> {
  const now = new Date().toISOString();
  const txHash = generateOnChainHash(snippetId, granteeWallet, permissionType, now);

  // Upsert: if previously revoked, re-activate
  const result = await sql`
    INSERT INTO snippet_permissions
      (snippet_id, grantee_wallet_address, permission_type, granted_by_wallet_address, on_chain_tx_hash, is_active, revoked_at)
    VALUES
      (${snippetId}, ${granteeWallet}, ${permissionType}, ${grantorWallet}, ${txHash}, true, null)
    ON CONFLICT (snippet_id, grantee_wallet_address, permission_type)
    DO UPDATE SET
      is_active = true,
      revoked_at = null,
      granted_by_wallet_address = ${grantorWallet},
      on_chain_tx_hash = ${txHash},
      granted_at = now()
    RETURNING *
  `;

  await logActivity({
    snippetId,
    actorWallet: grantorWallet,
    targetWallet: granteeWallet,
    action: "grant",
    permissionType,
    txHash,
  });

  return result[0] as SnippetPermission;
}

export async function revokePermission(
  snippetId: string,
  granteeWallet: string,
  permissionType: PermissionType,
  revokerWallet: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const txHash = generateOnChainHash(snippetId, granteeWallet, permissionType, now);

  const result = await sql`
    UPDATE snippet_permissions
    SET is_active = false, revoked_at = now(), on_chain_tx_hash = ${txHash}
    WHERE snippet_id = ${snippetId}
      AND grantee_wallet_address = ${granteeWallet}
      AND permission_type = ${permissionType}
      AND is_active = true
    RETURNING id
  `;

  if (result.length === 0) return false;

  await logActivity({
    snippetId,
    actorWallet: revokerWallet,
    targetWallet: granteeWallet,
    action: "revoke",
    permissionType,
    txHash,
  });

  return true;
}

// ── Activity Log ──────────────────────────────────────────────────────────────

async function logActivity(params: {
  snippetId: string;
  actorWallet: string;
  targetWallet: string;
  action: PermissionAction;
  permissionType: PermissionType;
  txHash: string;
}): Promise<void> {
  await sql`
    INSERT INTO permission_activity_log
      (snippet_id, actor_wallet_address, target_wallet_address, action, permission_type, on_chain_tx_hash)
    VALUES
      (${params.snippetId}, ${params.actorWallet}, ${params.targetWallet},
       ${params.action}, ${params.permissionType}, ${params.txHash})
  `;
}

export async function getActivityLog(
  snippetId: string,
  limit = 50,
): Promise<PermissionActivityLog[]> {
  const result = await sql`
    SELECT * FROM permission_activity_log
    WHERE snippet_id = ${snippetId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result as PermissionActivityLog[];
}
