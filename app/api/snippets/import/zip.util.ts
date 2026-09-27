import { inflateRawSync } from "zlib";

// ---------------------------------------------------------------------------
// Minimal, dependency-free ZIP reader used by the snippet import endpoint.
//
// Only what the import feature needs is implemented: reading file entries
// from local file headers (stored + deflate). Parsing is strict and bounded
// so malformed or malicious archives (zip bombs, oversized payloads) are
// rejected instead of exhausting memory.
// ---------------------------------------------------------------------------

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50; // PK\x03\x04
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50; // PK\x01\x02
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50; // PK\x05\x06

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

// Flag bit 3: sizes are written after the data (data descriptor). Such entries
// cannot be read safely from local headers alone, so they are rejected.
const FLAG_DATA_DESCRIPTOR = 0x08;

export const MAX_ZIP_ENTRIES = 50;
export const MAX_ZIP_ENTRY_BYTES = 2 * 1024 * 1024; // 2 MB per entry
export const MAX_ZIP_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB uncompressed total

export interface ZipEntry {
  filename: string;
  content: string;
}

export class ZipParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipParseError";
  }
}

function requireBytes(buffer: Buffer, offset: number, length: number): void {
  if (offset < 0 || offset + length > buffer.length) {
    throw new ZipParseError("Invalid ZIP archive: file is truncated or malformed");
  }
}

/**
 * Parse a ZIP archive buffer into its file entries.
 * Throws ZipParseError for malformed or unsafe archives.
 */
export function parseZip(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 4) {
    throw new ZipParseError("Invalid ZIP archive: file is too small");
  }

  const entries: ZipEntry[] = [];
  let totalUncompressed = 0;
  let offset = 0;

  while (offset < buffer.length) {
    requireBytes(buffer, offset, 4);
    const signature = buffer.readUInt32LE(offset);

    // Reached the central directory or end-of-archive records — done reading.
    if (
      signature === CENTRAL_DIRECTORY_SIGNATURE ||
      signature === END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      break;
    }

    if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new ZipParseError(
        "Invalid ZIP archive: bad local file header signature",
      );
    }

    requireBytes(buffer, offset, 30);
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const declaredUncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    if ((flags & FLAG_DATA_DESCRIPTOR) !== 0) {
      throw new ZipParseError(
        "Invalid ZIP archive: streamed entries are not supported",
      );
    }

    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new ZipParseError(
        `Invalid ZIP archive: unsupported compression method (${method})`,
      );
    }

    const dataOffset = offset + 30 + nameLength + extraLength;
    requireBytes(buffer, dataOffset, compressedSize);

    const filename = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

    let content: Buffer;
    if (method === METHOD_DEFLATE) {
      try {
        // maxOutputLength caps decompression so a zip bomb cannot allocate
        // unbounded memory before we enforce our own limit.
        content = inflateRawSync(compressed, {
          maxOutputLength: MAX_ZIP_ENTRY_BYTES + 1,
        });
      } catch {
        throw new ZipParseError(
          "Invalid ZIP archive: entry data is corrupt or not valid deflate",
        );
      }
      if (content.length !== declaredUncompressedSize) {
        throw new ZipParseError(
          `Invalid ZIP archive: entry "${filename}" size does not match its header`,
        );
      }
      if (content.length > MAX_ZIP_ENTRY_BYTES) {
        throw new ZipParseError(
          `ZIP entry "${filename}" exceeds the ${MAX_ZIP_ENTRY_BYTES} byte size limit`,
        );
      }
    } else {
      content = compressed;
      if (content.length > MAX_ZIP_ENTRY_BYTES) {
        throw new ZipParseError(
          `ZIP entry "${filename}" exceeds the ${MAX_ZIP_ENTRY_BYTES} byte size limit`,
        );
      }
    }

    totalUncompressed += content.length;
    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) {
      throw new ZipParseError(
        "ZIP archive exceeds the total uncompressed size limit",
      );
    }

    if (entries.length >= MAX_ZIP_ENTRIES) {
      throw new ZipParseError(
        `ZIP archive contains too many entries (maximum ${MAX_ZIP_ENTRIES})`,
      );
    }

    // Skip directory entries (filenames end with "/").
    if (!filename.endsWith("/")) {
      entries.push({ filename, content: content.toString("utf8") });
    }

    offset = dataOffset + compressedSize;
  }

  if (entries.length === 0) {
    throw new ZipParseError("Invalid ZIP archive: contains no file entries");
  }

  return entries;
}
