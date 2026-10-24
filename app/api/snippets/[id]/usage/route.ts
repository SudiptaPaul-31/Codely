import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { SnippetRepository } from "../../snippet.repository";
import { canEdit } from "@/lib/permissions.service";
import { verifyAuthentication } from "@/lib/auth-middleware";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";
import {
  parseStoredUsageInstructions,
  usageInstructionsInputSchema,
  usageValidationErrors,
} from "@/lib/usage-instructions";

/**
 * /api/snippets/[id]/usage — write access to a snippet's usage instructions.
 *
 * Reading the instructions needs no route of its own: they are a column on
 * the snippet, so `GET /api/snippets/[id]` returns them under its existing
 * visibility rules. This route only:
 *   GET    → whether the caller may edit them (drives the Edit button)
 *   PUT    → create or replace them
 *   DELETE → remove them
 *
 * Writes require a verified JWT *and* a live session (verifyAuthentication).
 * The `x-wallet-address` header is deliberately not accepted here: it is
 * unauthenticated, so trusting it would let anyone edit anyone's
 * documentation by naming the owner's wallet. Editing is then limited to the
 * owner or a collaborator granted "edit" (canEdit).
 */

const repository = new SnippetRepository();

async function authenticatedWallet(req: NextRequest): Promise<string | null> {
  const payload = await verifyAuthentication(req);
  const wallet = payload?.walletAddress ?? payload?.sub;
  return typeof wallet === "string" && /^G[A-Z2-7]{55}$/.test(wallet) ? wallet : null;
}

type Params = { params: Promise<{ id: string }> };

const unauthorized = () =>
  NextResponse.json(
    { error: "Unauthorized", message: "Sign in with your wallet to edit usage instructions." },
    { status: 401 },
  );
const forbidden = () =>
  NextResponse.json(
    { error: "Forbidden", message: "Only the snippet owner or an editor can change its usage instructions." },
    { status: 403 },
  );
const notFound = () => NextResponse.json({ error: "Snippet not found" }, { status: 404 });

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const snippet = await repository.findById(id);
    if (!snippet) return notFound();
    const wallet = await authenticatedWallet(req);
    return NextResponse.json({ canEdit: wallet ? await canEdit(id, wallet) : false });
  } catch (error) {
    console.error("[usage] permission check failed:", error);
    return NextResponse.json({ error: "Failed to check permissions" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const wallet = await authenticatedWallet(req);
    if (!wallet) return unauthorized();

    const snippet = await repository.findById(id);
    if (!snippet) return notFound();
    if (!(await canEdit(id, wallet))) return forbidden();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Validation failed", fields: { form: "Request body must be JSON" } }, { status: 400 });
    }

    const validated = usageInstructionsInputSchema.parse(body);
    const stored = { ...validated, updatedAt: new Date().toISOString(), updatedBy: wallet };
    const saved = await repository.setUsageInstructions(id, stored);
    if (!saved) return notFound();

    await appendActivityLog("snippet.updated", "snippet", {
      actorWallet: wallet,
      resourceId: id,
      metadata: { field: "usage_instructions", action: "saved" },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    return NextResponse.json({ usage_instructions: parseStoredUsageInstructions(saved.usage_instructions) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", fields: usageValidationErrors(error) },
        { status: 400 },
      );
    }
    console.error("[usage] save failed:", error);
    return NextResponse.json({ error: "Failed to save usage instructions" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const wallet = await authenticatedWallet(req);
    if (!wallet) return unauthorized();

    const snippet = await repository.findById(id);
    if (!snippet) return notFound();
    if (!(await canEdit(id, wallet))) return forbidden();

    const saved = await repository.setUsageInstructions(id, null);
    if (!saved) return notFound();

    await appendActivityLog("snippet.updated", "snippet", {
      actorWallet: wallet,
      resourceId: id,
      metadata: { field: "usage_instructions", action: "deleted" },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    return NextResponse.json({ usage_instructions: null });
  } catch (error) {
    console.error("[usage] delete failed:", error);
    return NextResponse.json({ error: "Failed to delete usage instructions" }, { status: 500 });
  }
}
