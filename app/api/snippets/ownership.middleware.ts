import { NextRequest, NextResponse } from "next/server";
import { SnippetRepository } from "./snippet.repository";
import { verifyJWT } from "@/lib/auth";

/**
 * Ownership Middleware
 *
 * Verifies that the wallet address in the request matches the snippet's stored owner.
 * Only the wallet owner who created the snippet should be able to modify or remove it.
 */

export class OwnershipMiddleware {
  private repository: SnippetRepository;

  constructor() {
    this.repository = new SnippetRepository();
  }

  /**
   * Check if the requester is the owner of the snippet
   * @param snippetId - The ID of the snippet to check
   * @param requesterWalletAddress - The wallet address making the request
   * @param includeDeleted - If true, also check deleted snippets
   * @returns Object with isOwner boolean and error response if not authorized
   */
  async verifyOwnership(
    snippetId: string,
    requesterWalletAddress: string,
    includeDeleted: boolean = false,
  ): Promise<{ isOwner: boolean; error?: NextResponse }> {
    try {
      // Fetch the snippet
      let snippet;
      if (includeDeleted) {
        // Get snippet including deleted ones
        const result = await this.repository["sql"]`
          SELECT * FROM snippets WHERE id = ${snippetId}
        `;
        snippet = result[0];
      } else {
        snippet = await this.repository.findById(snippetId);
      }

      if (!snippet) {
        return {
          isOwner: false,
          error: NextResponse.json(
            { error: "Not Found", message: "Snippet not found." },
            { status: 404 },
          ),
        };
      }

      // Get the stored owner wallet address
      const ownerWalletAddress = (snippet as any).owner_wallet_address;

      // If no owner is set, allow access (backward compatibility)
      if (!ownerWalletAddress) {
        return { isOwner: true };
      }

      // Compare addresses
      if (ownerWalletAddress !== requesterWalletAddress) {
        // Log failed ownership check for audit/debugging
        console.error("[OwnershipMiddleware] Access denied:", {
          snippetId,
          requesterWalletAddress: requesterWalletAddress.slice(0, 8) + "...",
          ownerWalletAddress: ownerWalletAddress.slice(0, 8) + "...",
          timestamp: new Date().toISOString(),
        });

        return {
          isOwner: false,
          error: NextResponse.json(
            {
              error: "Unauthorized",
              message: "You are not the owner of this snippet.",
            },
            { status: 403 },
          ),
        };
      }

      return { isOwner: true };
    } catch (error) {
      console.error("[OwnershipMiddleware] Error verifying ownership:", error);
      return {
        isOwner: false,
        error: NextResponse.json(
          {
            error: "Internal Server Error",
            message: "Failed to verify ownership.",
          },
          { status: 500 },
        ),
      };
    }
  }

  /**
   * Extract wallet address from request headers
   * In a real implementation, this would come from authenticated session/JWT
   * For now, we expect it to be passed in a custom header
   */
  static async extractWalletAddress(req: NextRequest): Promise<string | null> {
    // Try to get from custom header (set by client after wallet connection)
    const walletAddress = req.headers.get("x-wallet-address");

    if (
      walletAddress &&
      walletAddress.startsWith("G") &&
      walletAddress.length >= 56
    ) {
      return walletAddress;
    }

    // Fallback to JWT payload wallet if header is not provided.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);
    const verification = await verifyJWT(token);
    const jwtWallet = verification.valid
      ? verification.payload?.walletAddress || verification.payload?.sub
      : null;

    if (
      typeof jwtWallet === "string" &&
      jwtWallet.startsWith("G") &&
      jwtWallet.length >= 56
    ) {
      return jwtWallet;
    }

    return null;
  }
}

/**
 * Helper function to create ownership-checked handlers
 */
export function withOwnershipCheck(
  handler: (
    req: NextRequest,
    params: { id: string },
    walletAddress: string,
  ) => Promise<NextResponse>,
) {
  return async function (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    const { id } = await params;

    // Extract wallet address from request
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    // Verify ownership
    const middleware = new OwnershipMiddleware();
    const ownershipResult = await middleware.verifyOwnership(id, walletAddress);

    if (!ownershipResult.isOwner) {
      return ownershipResult.error!;
    }

    // Call the handler with wallet address
    return handler(req, { id }, walletAddress);
  };
}
