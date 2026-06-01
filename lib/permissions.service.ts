import {
  grantPermission,
  revokePermission,
  getPermissionsForSnippet,
  getPermissionForWallet,
  hasPermission,
  getActivityLog,
  PermissionType,
} from "./permissions.repository";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function getSnippetOwner(snippetId: string): Promise<string | null> {
  const result = await sql`
    SELECT owner_wallet_address FROM snippets WHERE id = ${snippetId}
  `;
  return (result[0]?.owner_wallet_address as string) ?? null;
}

/**
 * Checks whether a wallet can view a snippet.
 * Owner always has access; otherwise checks active view/edit permission.
 */
export async function canView(
  snippetId: string,
  walletAddress: string,
): Promise<boolean> {
  const owner = await getSnippetOwner(snippetId);
  if (owner === walletAddress) return true;
  // edit permission implies view
  const [canViewDirect, canEdit] = await Promise.all([
    hasPermission(snippetId, walletAddress, "view"),
    hasPermission(snippetId, walletAddress, "edit"),
  ]);
  return canViewDirect || canEdit;
}

/**
 * Checks whether a wallet can edit a snippet.
 */
export async function canEdit(
  snippetId: string,
  walletAddress: string,
): Promise<boolean> {
  const owner = await getSnippetOwner(snippetId);
  if (owner === walletAddress) return true;
  return hasPermission(snippetId, walletAddress, "edit");
}

/**
 * Grant a permission. Only the snippet owner may grant.
 */
export async function grant(
  snippetId: string,
  granteeWallet: string,
  permissionType: PermissionType,
  grantorWallet: string,
): Promise<{ success: boolean; error?: string; permission?: any }> {
  const owner = await getSnippetOwner(snippetId);
  if (!owner) return { success: false, error: "Snippet not found" };
  if (owner !== grantorWallet)
    return { success: false, error: "Only the snippet owner can grant permissions" };
  if (owner === granteeWallet)
    return { success: false, error: "Owner already has full access" };

  const permission = await grantPermission(snippetId, granteeWallet, permissionType, grantorWallet);
  return { success: true, permission };
}

/**
 * Revoke a permission. Only the snippet owner may revoke.
 */
export async function revoke(
  snippetId: string,
  granteeWallet: string,
  permissionType: PermissionType,
  revokerWallet: string,
): Promise<{ success: boolean; error?: string }> {
  const owner = await getSnippetOwner(snippetId);
  if (!owner) return { success: false, error: "Snippet not found" };
  if (owner !== revokerWallet)
    return { success: false, error: "Only the snippet owner can revoke permissions" };

  const revoked = await revokePermission(snippetId, granteeWallet, permissionType, revokerWallet);
  if (!revoked) return { success: false, error: "Permission not found or already revoked" };
  return { success: true };
}

export { getPermissionsForSnippet, getPermissionForWallet, getActivityLog };
