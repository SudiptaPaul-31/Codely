import { NextRequest, NextResponse } from "next/server";
import { SnippetRepository } from "../snippet.repository";
import { SnippetService } from "../snippet.service";
import { OwnershipMiddleware } from "../ownership.middleware";
import {
  importSnippetSchema,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ITEMS,
  validationErrorBody,
  validationFailureBody,
  type ImportSnippetDTO,
  type ValidationErrorBody,
} from "../snippet.validator";
import { parseZip, ZipParseError, type ZipEntry } from "./zip.util";

// Dependency Injection instantiation
const repository = new SnippetRepository();
const service = new SnippetService(repository);

const JSON_CONTENT_TYPES = ["application/json", "text/json"];
const ZIP_CONTENT_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

/** Accept a single snippet object or an array of snippet objects. */
function normalizePayload(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload !== null && typeof payload === "object") {
    return [payload];
  }
  return null;
}

/**
 * Validate every item BEFORE anything is persisted, so malformed or invalid
 * imported snippets can never partially enter the database.
 */
function validateItems(
  items: unknown[],
): { ok: true; data: ImportSnippetDTO[] } | { ok: false; error: ValidationErrorBody } {
  if (items.length === 0) {
    return {
      ok: false,
      error: {
        error: "Validation failed",
        message: "Import payload must contain at least one snippet",
        details: [
          { field: "items", message: "Import payload must contain at least one snippet" },
        ],
      },
    };
  }

  if (items.length > MAX_IMPORT_ITEMS) {
    return {
      ok: false,
      error: {
        error: "Validation failed",
        message: `Import payload contains too many snippets (maximum ${MAX_IMPORT_ITEMS})`,
        details: [
          {
            field: "items",
            message: `Import payload contains too many snippets (maximum ${MAX_IMPORT_ITEMS})`,
          },
        ],
      },
    };
  }

  const data: ImportSnippetDTO[] = [];
  for (let i = 0; i < items.length; i++) {
    const parsed = importSnippetSchema.safeParse(items[i]);
    if (!parsed.success) {
      return { ok: false, error: validationErrorBody(parsed.error, `items[${i}]`) };
    }
    data.push(parsed.data);
  }

  return { ok: true, data };
}

function collectZipItems(entries: ZipEntry[]): { ok: true; items: unknown[] } | { ok: false; message: string } {
  const jsonEntries = entries.filter((entry) => {
    const name = entry.filename.toLowerCase();
    return (
      name.endsWith(".json") &&
      !name.includes("__macosx") &&
      !name.startsWith("._")
    );
  });

  if (jsonEntries.length === 0) {
    return {
      ok: false,
      message: "ZIP archive must contain a JSON manifest file (e.g. snippets.json)",
    };
  }

  const items: unknown[] = [];
  for (const entry of jsonEntries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.content);
    } catch {
      return {
        ok: false,
        message: `Invalid JSON inside ZIP entry "${entry.filename}"`,
      };
    }

    const normalized = normalizePayload(parsed);
    if (normalized === null) {
      return {
        ok: false,
        message: `ZIP entry "${entry.filename}" must contain a snippet object or an array of snippet objects`,
      };
    }
    items.push(...normalized);
  }

  return { ok: true, items };
}

/**
 * POST /api/snippets/import
 *
 * Import one or more snippets from a JSON body or a ZIP archive containing a
 * JSON manifest. Every snippet is validated with the same centralized rules
 * used by snippet creation BEFORE anything is persisted. The authenticated
 * wallet always becomes the owner of imported snippets.
 */
export async function POST(req: NextRequest) {
  try {
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

    if (JSON_CONTENT_TYPES.some((type) => contentType.includes(type))) {
      let payload: unknown;
      try {
        payload = await req.json();
      } catch {
        return validationFailureResponse("Request body is not valid JSON");
      }

      const items = normalizePayload(payload);
      if (items === null) {
        return validationFailureResponse(
          "Import payload must be a snippet object or an array of snippet objects",
        );
      }

      const validation = validateItems(items);
      if (!validation.ok) {
        return NextResponse.json(validation.error, { status: 400 });
      }

      const created = await persistImported(validation.data, walletAddress);
      return NextResponse.json({ imported: created.length, snippets: created }, { status: 201 });
    }

    if (ZIP_CONTENT_TYPES.some((type) => contentType.includes(type))) {
      const buffer = Buffer.from(await req.arrayBuffer());
      if (buffer.byteLength > MAX_IMPORT_BYTES) {
        return validationFailureResponse(
          `Import payload is too large (maximum ${MAX_IMPORT_BYTES} bytes)`,
          "file",
        );
      }

      let entries: ZipEntry[];
      try {
        entries = parseZip(buffer);
      } catch (error) {
        const message =
          error instanceof ZipParseError
            ? error.message
            : "Invalid ZIP archive";
        return validationFailureResponse(message, "file");
      }

      const collected = collectZipItems(entries);
      if (!collected.ok) {
        return validationFailureResponse(collected.message, "file");
      }

      const validation = validateItems(collected.items);
      if (!validation.ok) {
        return NextResponse.json(validation.error, { status: 400 });
      }

      const created = await persistImported(validation.data, walletAddress);
      return NextResponse.json({ imported: created.length, snippets: created }, { status: 201 });
    }

    return validationFailureResponse(
      "Unsupported content type. Use application/json or application/zip",
    );
  } catch (error) {
    console.error("[Snippet Import] POST error:", error);
    return NextResponse.json(
      { error: "Failed to import snippets" },
      { status: 500 },
    );
  }
}

/**
 * Build the single consistent 400 validation payload used across snippet
 * endpoints: { error, message, details }.
 */
function validationFailureResponse(message: string, field = "body"): NextResponse {
  return NextResponse.json(validationFailureBody(message, field), { status: 400 });
}

async function persistImported(items: ImportSnippetDTO[], ownerWalletAddress: string) {
  const created = [];
  // All items are already validated; reuse the existing creation pipeline so
  // imported snippets get the exact same treatment (IPFS, audit, etc.) as
  // normally created ones.
  for (const item of items) {
    created.push(
      await service.createSnippet({ ...item, ownerWalletAddress }),
    );
  }
  return created;
}
