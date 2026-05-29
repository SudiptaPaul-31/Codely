import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../../ownership.middleware";
import {
  grant,
  revoke,
  getPermissionsForSnippet,
  getActivityLog,
} from "@/lib/permissions.service";
import { z } from "zod";

const grantSchema = z.object({
  granteeWalletAddress: z
    .string()
    .min(56, "Invalid Stellar wallet address")
    .max(56, "Invalid Stellar wallet address"),
  permissionType: z.enum(["view", "edit"]),
});

const revokeSchema = z.object({
  granteeWalletAddress: z.string().min(56).max(56),
  permissionType: z.enum(["view", "edit"]),
});

/**
 * GET /api/snippets/[id]/permissions
 * Returns active permissions and activity log for a snippet.
 * Only the snippet owner can see the full list.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const includeLog = url.searchParams.get("includeLog") === "true";

    const [permissions, activityLog] = await Promise.all([
      getPermissionsForSnippet(id),
      includeLog ? getActivityLog(id) : Promise.resolve([]),
    ]);

    return NextResponse.json({ permissions, activityLog });
  } catch (error) {
    console.error("[Permissions] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
  }
}

/**
 * POST /api/snippets/[id]/permissions
 * Grant a permission to a wallet address.
 * Body: { granteeWalletAddress, permissionType }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = grantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { granteeWalletAddress, permissionType } = parsed.data;

    const result = await grant(id, granteeWalletAddress, permissionType, walletAddress);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json(result.permission, { status: 201 });
  } catch (error) {
    console.error("[Permissions] POST error:", error);
    return NextResponse.json({ error: "Failed to grant permission" }, { status: 500 });
  }
}

/**
 * DELETE /api/snippets/[id]/permissions
 * Revoke a permission from a wallet address.
 * Body: { granteeWalletAddress, permissionType }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = revokeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { granteeWalletAddress, permissionType } = parsed.data;

    const result = await revoke(id, granteeWalletAddress, permissionType, walletAddress);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ message: "Permission revoked" });
  } catch (error) {
    console.error("[Permissions] DELETE error:", error);
    return NextResponse.json({ error: "Failed to revoke permission" }, { status: 500 });
  }
}
