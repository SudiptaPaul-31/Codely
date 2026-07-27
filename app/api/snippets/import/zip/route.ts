import { NextRequest, NextResponse } from "next/server";
import { SnippetRepository } from "../../snippet.repository";
import { SnippetService } from "../../snippet.service";
import { OwnershipMiddleware } from "../../ownership.middleware";
import AdmZip from "adm-zip";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  java: "java",
  cs: "csharp",
  cpp: "cpp",
  go: "go",
  rs: "rust",
  php: "php",
  rb: "ruby",
  sql: "sql",
  html: "html",
  css: "css",
  sh: "bash",
};

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
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Unsupported Media Type", message: "Content-Type must be multipart/form-data." },
        { status: 415 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Bad Request", message: "No file was uploaded in the 'file' field." },
        { status: 400 }
      );
    }

    // 2. Parse ZIP entries in-memory
    let zip;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      zip = new AdmZip(buffer);
    } catch (e) {
      return NextResponse.json(
        { error: "Malformed File", message: "Uploaded file is not a valid ZIP archive." },
        { status: 400 }
      );
    }

    const zipEntries = zip.getEntries();
    const entryMap: Record<string, string> = {};

    for (const entry of zipEntries) {
      if (entry.isDirectory || entry.entryName.startsWith(".") || entry.entryName.includes("__MACOSX")) {
        continue;
      }
      entryMap[entry.entryName] = entry.getData().toString("utf8");
    }

    const rawSnippets: any[] = [];

    for (const entryName in entryMap) {
      if (entryName.endsWith(".json")) {
        // Standalone JSON snippet import (check if it has companion code file to avoid double-processing)
        const baseName = entryName.substring(0, entryName.length - 5);
        const hasMatchingCodeFile = Object.keys(entryMap).some(
          name => name.startsWith(baseName) && !name.endsWith(".json")
        );
        if (hasMatchingCodeFile) {
          continue;
        }

        try {
          const content = JSON.parse(entryMap[entryName]);
          rawSnippets.push(content);
        } catch (e) {
          console.warn(`Failed to parse standalone JSON file ${entryName} in ZIP:`, e);
        }
      } else {
        // Source code file import
        const content = entryMap[entryName];
        const lastDot = entryName.lastIndexOf(".");
        const ext = lastDot !== -1 ? entryName.substring(lastDot + 1).toLowerCase() : "";
        const baseName = lastDot !== -1 ? entryName.substring(0, lastDot) : entryName;
        const cleanBaseName = baseName.split("/").pop() || baseName;

        const language = EXTENSION_TO_LANGUAGE[ext] || "text";

        // Generate user friendly title
        const title = cleanBaseName
          .replace(/[_-]+/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase());

        let metadata: any = {
          description: `Imported from ZIP file: ${entryName}`,
          tags: ["imported"],
        };

        // Attempt to find companion JSON file for metadata
        const companionName = baseName + ".json";
        if (entryMap[companionName]) {
          try {
            const companionData = JSON.parse(entryMap[companionName]);
            if (companionData.metadata) {
              metadata = {
                description: companionData.metadata.description || metadata.description,
                tags: companionData.metadata.tags || metadata.tags,
              };
            } else {
              metadata = {
                description: companionData.description || metadata.description,
                tags: companionData.tags || metadata.tags,
              };
            }
          } catch (e) {
            console.warn(`Failed to parse companion JSON file ${companionName}:`, e);
          }
        }

        rawSnippets.push({
          title,
          code: content,
          language,
          metadata,
        });
      }
    }

    if (rawSnippets.length === 0) {
      return NextResponse.json(
        { error: "Bad Request", message: "No valid snippets found in the ZIP archive." },
        { status: 400 }
      );
    }

    // 3. Delegate to service layer
    const result = await service.importSnippets(rawSnippets, walletAddress);

    if (result.errors.length === rawSnippets.length) {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: "All snippets in the ZIP file failed validation.",
          details: result.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `ZIP Import processed. Successfully imported: ${result.imported.length}, Skipped duplicates: ${result.duplicates.length}, Failed validation: ${result.errors.length}`,
      importedCount: result.imported.length,
      skippedCount: result.duplicates.length,
      failedCount: result.errors.length,
      imported: result.imported.map(s => ({ id: s.id, title: s.title })),
      duplicates: result.duplicates,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[ZIP Import API] Unexpected Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error instanceof Error ? error.message : "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
