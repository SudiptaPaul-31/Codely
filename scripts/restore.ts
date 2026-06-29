import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { restoreBackup, listBackups } from '../lib/backup.service';

async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === 'list') {
    const backups = listBackups();
    console.log('Available backups:');
    backups.forEach(b => console.log(`- ${b.filename} (Size: ${b.size} bytes, Date: ${b.createdAt})`));
    return;
  }

  const filename = args[0];
  if (!filename) {
    console.error('Usage: npx tsx scripts/restore.ts <filename> [snippetId1,snippetId2,...]');
    console.error('       npx tsx scripts/restore.ts list');
    process.exit(1);
  }

  const snippetIds = args[1] ? args[1].split(',').map(s => s.trim()) : undefined;

  console.log(`Starting restore from ${filename}...`);
  if (snippetIds) {
    console.log(`Partial restore for snippets: ${snippetIds.join(', ')}`);
  } else {
    console.log(`Full restore selected.`);
  }

  try {
    const result = await restoreBackup(filename, snippetIds);
    console.log(`Restore completed successfully! Restored ${result.restoredCount} snippets.`);
  } catch (error) {
    console.error('Restore failed:', error);
    process.exit(1);
  }
}

main();
