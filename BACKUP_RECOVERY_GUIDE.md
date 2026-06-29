# Backup and Recovery Guide

Codely uses an automated system to back up and restore database snippet data securely. All backups are encrypted using AES-256-GCM.

## Environment Setup

To use the backup and recovery system, you must set the following environment variables in your `.env` or `.env.local`:

```ini
# Encryption key for AES-256-GCM (must be a secret)
BACKUP_ENCRYPTION_KEY="your-secure-encryption-key"

# Secret required to trigger the cron backup API
CRON_SECRET="your-cron-secret-token"

# API Key required to trigger admin recovery routes
ADMIN_API_KEY="your-admin-api-key"
```

## Automated Backups

Backups are run automatically using Vercel Cron. The configuration is defined in `vercel.json` which triggers the `/api/cron/backup` endpoint every day at midnight (UTC).

You can manually trigger the cron job locally:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/backup
```

## Manual Backup (CLI)

You can run a backup manually from the command line:
```bash
npx tsx scripts/backup.ts
```

This will fetch all snippets, encrypt them, and store them in the `backups/` directory as `snippets-backup-<timestamp>.enc`.

## Restoring Backups

You can list all available backups:
```bash
npx tsx scripts/restore.ts list
```

To perform a **Full Restore** of all snippets from a specific backup file:
```bash
npx tsx scripts/restore.ts snippets-backup-1234.enc
```

To perform a **Partial Restore** (only restoring specific snippets by their IDs):
```bash
npx tsx scripts/restore.ts snippets-backup-1234.enc "snippet-id-1,snippet-id-2"
```

### Admin Recovery API

You can also trigger a recovery via the API endpoint:
```bash
curl -X POST http://localhost:3000/api/admin/recovery \
     -H "Authorization: Bearer <ADMIN_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"filename":"snippets-backup-1234.enc", "snippetIds":["snippet-id-1"]}'
```

## Storage Engine

Currently, backups are stored in the local file system `backups/` directory. For production environments where the local file system is ephemeral, `lib/backup.service.ts` should be updated to upload these encrypted files to an S3 bucket or equivalent cloud storage provider.
