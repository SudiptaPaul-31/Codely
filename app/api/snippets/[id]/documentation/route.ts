import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../../ownership.middleware";
import {
  snippetDocumentationService,
  DocumentationAuthError,
  DocumentationNotFoundError,
  DocumentationValidationError,
  type SnippetAccessResolver,
} from "@/lib/snippet-documentation-service";

type Params = { params: Promise<{ id: string }> };

let defaultDatabaseResolver: SnippetAccessResolver | null = null;

function syncDefaultAccessResolver(): void {
  const shouldUseDatabaseResolver =
    Boolean(process.env.DATABASE_URL) &&
    (process.env.NODE_ENV !== "test" ||
      process.env.CODELY_ENABLE_DB_DOC_RESOLVER === "true");

  if (!shouldUseDatabaseResolver) {
    if (
      defaultDatabaseResolver &&
      snippetDocumentationService.getAccessResolver() ===
        defaultDatabaseResolver
    ) {
      snippetDocumentationService.setAccessResolver(null);
    }
    return;
  }

  if (snippetDocumentationService.hasAccessResolver()) {
    return;
  }

  defaultDatabaseResolver = {
    async resolveSnippet(snippetId: string) {
      const { SnippetRepository } = await import("../../snippet.repository");
      const repo = new SnippetRepository();
      const row = (await repo.findById(snippetId)) as {
        id?: string;
        owner_wallet_address?: string | null;
        visibility?: "private" | "public" | "shared" | null;
      } | null;
      if (!row || !row.id) {
        return null;
      }
      return {
        id: row.id,
        ownerWalletAddress: row.owner_wallet_address ?? "",
        visibility: row.visibility ?? "private",
        exists: true,
      };
    },
    async canEditSnippet(snippetId: string, walletAddress: string) {
      const { canEdit } = await import("@/lib/permissions.service");
      return canEdit(snippetId, walletAddress);
    },
    async canViewSnippet(snippetId: string, walletAddress: string) {
      const [{ SnippetRepository }, { canView }] = await Promise.all([
        import("../../snippet.repository"),
        import("@/lib/permissions.service"),
      ]);
      const repo = new SnippetRepository();
      if (await repo.isSharedWith(snippetId, walletAddress)) {
        return true;
      }
      return canView(snippetId, walletAddress);
    },
  };

  snippetDocumentationService.setAccessResolver(defaultDatabaseResolver);
}

async function resolveActorWallet(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader && !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return OwnershipMiddleware.extractWalletAddress(req);
}

function handleDocumentationError(error: unknown) {
  if (error instanceof DocumentationAuthError) {
    return NextResponse.json(
      { error: "Authorization failed", message: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof DocumentationNotFoundError) {
    return NextResponse.json(
      { error: "Not found", message: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof DocumentationValidationError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        message: error.message,
        fields: error.fields ?? {},
      },
      { status: error.statusCode },
    );
  }
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

/**
 * GET /api/snippets/[id]/documentation
 * Retrieve structured documentation for a snippet.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    syncDefaultAccessResolver();
    const { id } = await params;
    const viewerWallet = await resolveActorWallet(req);
    const response = await snippetDocumentationService.getDocumentation(
      id,
      viewerWallet,
    );
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return handleDocumentationError(error);
  }
}

/**
 * POST /api/snippets/[id]/documentation
 * Create structured documentation for a snippet.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    syncDefaultAccessResolver();
    const { id } = await params;
    const actorWallet = await resolveActorWallet(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: "Request body must be valid JSON.",
          fields: { form: "Request body must be valid JSON." },
        },
        { status: 400 },
      );
    }

    const result = await snippetDocumentationService.createDocumentation(
      id,
      body,
      actorWallet,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleDocumentationError(error);
  }
}

/**
 * PUT /api/snippets/[id]/documentation
 * Update existing structured documentation for a snippet.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    syncDefaultAccessResolver();
    const { id } = await params;
    const actorWallet = await resolveActorWallet(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: "Request body must be valid JSON.",
          fields: { form: "Request body must be valid JSON." },
        },
        { status: 400 },
      );
    }

    const result = await snippetDocumentationService.updateDocumentation(
      id,
      body,
      actorWallet,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleDocumentationError(error);
  }
}

/**
 * DELETE /api/snippets/[id]/documentation
 * Remove documentation associated with a snippet.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    syncDefaultAccessResolver();
    const { id } = await params;
    const actorWallet = await resolveActorWallet(req);

    const result = await snippetDocumentationService.deleteDocumentation(
      id,
      actorWallet,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleDocumentationError(error);
  }
}
