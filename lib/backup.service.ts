import fs from 'fs';
import path from 'path';
import { sql } from './db';
import { encryptData, decryptData } from './encryption';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

export interface BackupMetadata {
  filename: string;
  createdAt: string;
  size: number;
}

/**
 * Ensures the backups directory exists.
 */
function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Creates an encrypted backup of all snippets.
 */
export async function createBackup(): Promise<BackupMetadata> {
  ensureBackupsDir();

  console.log('[BackupService] Fetching all snippets from database...');
  // Fetch all snippets
  const snippets = await sql`SELECT * FROM snippets`;
  
  const payload = {
    version: 1,
    timestamp: new Date().toISOString(),
    data: { snippets },
  };

  const jsonString = JSON.stringify(payload);
  console.log(`[BackupService] Encrypting backup payload (${snippets.length} snippets)...`);
  const encryptedString = encryptData(jsonString);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `snippets-backup-${timestamp}.enc`;
  const filePath = path.join(BACKUPS_DIR, filename);

  fs.writeFileSync(filePath, encryptedString, 'utf8');
  console.log(`[BackupService] Backup successfully created at ${filePath}`);

  const stat = fs.statSync(filePath);

  return {
    filename,
    createdAt: new Date().toISOString(),
    size: stat.size,
  };
}

/**
 * Lists all available backup files.
 */
export function listBackups(): BackupMetadata[] {
  ensureBackupsDir();

  const files = fs.readdirSync(BACKUPS_DIR).filter(file => file.endsWith('.enc'));
  
  return files.map(file => {
    const filePath = path.join(BACKUPS_DIR, file);
    const stat = fs.statSync(filePath);
    return {
      filename: file,
      createdAt: stat.birthtime.toISOString(),
      size: stat.size,
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Restores snippets from a specific backup file.
 * @param filename The name of the backup file to restore from.
 * @param snippetIds Optional. If provided, only restores these specific snippet IDs (partial recovery).
 */
export async function restoreBackup(filename: string, snippetIds?: string[]): Promise<{ restoredCount: number }> {
  const filePath = path.join(BACKUPS_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file ${filename} not found.`);
  }

  console.log(`[BackupService] Reading backup file ${filePath}...`);
  const encryptedPayload = fs.readFileSync(filePath, 'utf8');
  
  console.log(`[BackupService] Decrypting backup file...`);
  const jsonString = decryptData(encryptedPayload);
  
  const payload = JSON.parse(jsonString);
  const snippets = payload.data?.snippets || [];
  
  if (!Array.isArray(snippets)) {
    throw new Error('Invalid backup format: snippets data is missing or not an array.');
  }

  // Filter snippets for partial recovery if snippetIds is provided
  const snippetsToRestore = snippetIds && snippetIds.length > 0
    ? snippets.filter(s => snippetIds.includes(s.id))
    : snippets;

  console.log(`[BackupService] Restoring ${snippetsToRestore.length} snippets...`);

  let restoredCount = 0;

  for (const snippet of snippetsToRestore) {
    try {
      // Assuming upsert logic based on id
      // Since Neon Serverless allows raw queries, we use an INSERT ... ON CONFLICT DO UPDATE
      // The conflict target is "id"
      await sql`
        INSERT INTO snippets (
          id, title, description, code, language, tags, 
          owner_wallet_address, owner, is_deleted, created_at, updated_at, revision
        ) VALUES (
          ${snippet.id}, ${snippet.title}, ${snippet.description}, ${snippet.code}, 
          ${snippet.language}, ${snippet.tags}, ${snippet.owner_wallet_address}, 
          ${snippet.owner}, ${snippet.is_deleted || false}, ${snippet.created_at}, 
          ${snippet.updated_at}, ${snippet.revision || 0}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          code = EXCLUDED.code,
          language = EXCLUDED.language,
          tags = EXCLUDED.tags,
          owner_wallet_address = EXCLUDED.owner_wallet_address,
          owner = EXCLUDED.owner,
          is_deleted = EXCLUDED.is_deleted,
          updated_at = EXCLUDED.updated_at,
          revision = EXCLUDED.revision
      `;
      restoredCount++;
    } catch (err) {
      console.error(`[BackupService] Failed to restore snippet ${snippet.id}:`, err);
    }
  }

  console.log(`[BackupService] Successfully restored ${restoredCount} snippets.`);
  
  return { restoredCount };
}
