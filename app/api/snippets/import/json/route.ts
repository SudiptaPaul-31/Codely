import { NextRequest, NextResponse } from "next/server";
import { SnippetRepository } from "../../snippet.repository";
import { SnippetService } from "../../snippet.service";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { ZodError } from "zod";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user wallet
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing or invalid wallet authentication." },
        { status: 401 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let rawSnippets: any[] = [];

    // 2. Parse payload based on content type
    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (Array.isArray(body)) {
        rawSnippets = body;
      } else if (body && typeof body === "object") {
        // If it's a single snippet wrapper object containing a snippets array
        if (Array.isArray(body.snippets)) {
          rawSnippets = body.snippets;
        } else {
          rawSnippets = [body];
        }
      } else {
        return NextResponse.json(
          { error: "Malformed Request", message: "Invalid JSON format." },
          { status: 400 }
        );
      }
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "Bad Request", message: "No file was uploaded in the 'file' field." },
          { status: 400 }
        );
      }

      const fileText = await file.text();
      let parsedData;
      try {
        parsedData = JSON.parse(fileText);
      } catch (e) {
        return NextResponse.json(
          { error: "Malformed File", message: "Uploaded file is not a valid JSON document." },
          { status: 400 }
        );
      }

      if (Array.isArray(parsedData)) {
        rawSnippets = parsedData;
      } else if (parsedData && typeof parsedData === "object") {
        if (Array.isArray(parsedData.snippets)) {
          rawSnippets = parsedData.snippets;
        } else {
          rawSnippets = [parsedData];
        }
      } else {
        return NextResponse.json(
          { error: "Malformed File", message: "Invalid snippet list format in file." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported Media Type", message: "Content-Type must be application/json or multipart/form-data." },
        { status: 415 }
      );
    }

    if (rawSnippets.length === 0) {
      return NextResponse.json(
        { error: "Bad Request", message: "No snippets found to import." },
        { status: 400 }
      );
    }

    // 3. Delegate to service layer
    const result = await service.importSnippets(rawSnippets, walletAddress);

    // If there were only errors and no imports/duplicates
    if (result.errors.length === rawSnippets.length) {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: "All uploaded snippets failed validation.",
          details: result.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Import processed. Successfully imported: ${result.imported.length}, Skipped duplicates: ${result.duplicates.length}, Failed validation: ${result.errors.length}`,
      importedCount: result.imported.length,
      skippedCount: result.duplicates.length,
      failedCount: result.errors.length,
      imported: result.imported.map(s => ({ id: s.id, title: s.title })),
      duplicates: result.duplicates,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[JSON Import API] Unexpected Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error instanceof Error ? error.message : "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
