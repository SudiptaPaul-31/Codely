import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createBackup } from '../lib/backup.service';

async function main() {
  console.log('Starting manual backup...');
  try {
    const metadata = await createBackup();
    console.log('Backup completed successfully!');
    console.log(metadata);
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
}

main();
