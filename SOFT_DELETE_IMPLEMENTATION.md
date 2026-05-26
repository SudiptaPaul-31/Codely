# Soft Delete Implementation Guide

## Overview

This document describes the soft delete functionality implemented for the Codely snippet management application. Soft delete allows users to recover accidentally deleted snippets without permanent data loss.

## Architecture

### 1. Schema Changes

#### New Columns in `snippets` Table
```sql
- is_deleted (BOOLEAN, DEFAULT FALSE)
- deleted_at (TIMESTAMP, nullable)
- deleted_by (VARCHAR(255), nullable)
```

#### New Table: `activity_logs`
Tracks all user actions for audit trail:
```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,  -- DELETE, RESTORE, CREATE, UPDATE
  user_wallet_address VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Database Indexes

For optimal query performance:
- `idx_snippets_is_deleted` - Filter active snippets
- `idx_snippets_deleted_at` - Sort deleted snippets by deletion date
- `idx_snippets_active` - Combined index for active snippet queries
- `idx_activity_logs_*` - Various activity log queries

## Implementation Details

### Query Filtering Strategy

All snippet queries automatically exclude soft-deleted items by default:

```typescript
// In SnippetRepository.findAll()
const result = await this.sql`
  SELECT * FROM snippets 
  WHERE is_deleted = false  // ← Automatic filtering
  ORDER BY created_at DESC 
  LIMIT ${limit} OFFSET ${offset}
`;
```

**Key Methods:**
- `findAll()` - Returns only active snippets
- `findById()` - Returns only active snippets
- `findDeletedByUser()` - Returns only deleted snippets for a user
- `findAllDeleted()` - Returns all deleted snippets (admin)

### Service Layer

The `SnippetService` provides high-level operations:

```typescript
// Soft delete (preserves data)
await service.deleteSnippet(id, userWalletAddress);

// Restore from trash
await service.restoreSnippet(id, userWalletAddress);

// Get user's trash
await service.getUserTrash(userWalletAddress, options);

// Permanent delete (admin only)
await service.permanentlyDeleteSnippet(id);
```

### Activity Logging

All delete/restore actions are logged automatically:

```typescript
// Logged automatically in service methods
await ActivityLogger.log(
  snippetId,
  "DELETE",
  userWalletAddress,
  {
    title: snippet.title,
    language: snippet.language,
    deletedAt: new Date().toISOString(),
  }
);
```

## API Endpoints

### 1. Delete Snippet (Soft Delete)
```
DELETE /api/snippets/[id]
Headers: x-wallet-address: <user-wallet>

Response:
{
  "message": "Snippet deleted successfully",
  "note": "Snippet moved to trash. You can restore it from the trash section."
}
```

### 2. Get Trash (User's Deleted Snippets)
```
GET /api/snippets/trash?limit=20&offset=0
Headers: x-wallet-address: <user-wallet>

Response:
{
  "data": [
    {
      "id": "uuid",
      "title": "My Snippet",
      "language": "javascript",
      "deleted_at": "2026-05-26T10:30:00Z",
      "deleted_by": "GXXXXXX...",
      ...
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### 3. Restore Snippet
```
POST /api/snippets/[id]/restore
Headers: x-wallet-address: <user-wallet>

Response:
{
  "message": "Snippet restored successfully",
  "snippet": {
    "id": "uuid",
    "title": "My Snippet",
    "is_deleted": false,
    "deleted_at": null,
    ...
  }
}
```

### 4. Get Activity History
```
GET /api/snippets/[id]/activity?limit=50
Headers: x-wallet-address: <user-wallet>

Response:
{
  "snippetId": "uuid",
  "activities": [
    {
      "id": "uuid",
      "action": "DELETE",
      "userWalletAddress": "GXXXXXX...",
      "details": {
        "title": "My Snippet",
        "language": "javascript",
        "deletedAt": "2026-05-26T10:30:00Z"
      },
      "createdAt": "2026-05-26T10:30:00Z"
    },
    {
      "id": "uuid",
      "action": "RESTORE",
      "userWalletAddress": "GXXXXXX...",
      "details": {
        "title": "My Snippet",
        "language": "javascript",
        "restoredAt": "2026-05-26T10:35:00Z"
      },
      "createdAt": "2026-05-26T10:35:00Z"
    }
  ],
  "total": 2
}
```

## File Structure

### New Files Created
```
lib/
  └── activity-logger.ts          # Activity logging utility

app/api/snippets/
  ├── trash/
  │   └── route.ts                # GET trash endpoint
  ├── [id]/
  │   ├── restore/
  │   │   └── route.ts            # POST restore endpoint
  │   └── activity/
  │       └── route.ts            # GET activity history endpoint

scripts/
  └── add-soft-delete.sql         # Migration script
```

### Modified Files
```
app/api/snippets/
  ├── snippet.repository.ts       # Added soft delete methods
  ├── snippet.service.ts          # Added soft delete service methods
  ├── [id]/route.ts               # Updated DELETE to use soft delete
  └── ownership.middleware.ts     # Added includeDeleted parameter

lib/
  └── (no changes to existing files)
```

## Migration Steps

### 1. Run Database Migration
```bash
# Execute the migration script
psql $DATABASE_URL < scripts/add-soft-delete.sql
```

### 2. Verify Schema
```sql
-- Check new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'snippets' 
AND column_name IN ('is_deleted', 'deleted_at', 'deleted_by');

-- Check activity_logs table
SELECT * FROM information_schema.tables 
WHERE table_name = 'activity_logs';
```

### 3. Deploy Code Changes
- Update repository with new code
- Deploy to production
- Monitor logs for any issues

## Permissions & Security

### Ownership Verification
- Users can only restore their own deleted snippets
- Users can only view their own trash
- Wallet address is extracted from request headers and verified

### Admin Operations
- Permanent deletion requires admin privileges (not yet implemented in UI)
- Activity logs are immutable and track all actions

## Data Retention Policy

### Current Implementation
- Soft-deleted snippets are retained indefinitely
- No automatic cleanup process

### Recommended Future Enhancement
```typescript
// Cleanup job (to be implemented)
// Permanently delete snippets deleted > 30 days ago
const RETENTION_DAYS = 30;
const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

const result = await sql`
  DELETE FROM snippets 
  WHERE is_deleted = true 
  AND deleted_at < ${cutoffDate}
`;
```

## Frontend Integration

### UI Components Needed

#### 1. Trash Section
```typescript
// Show deleted snippets
const trash = await fetch('/api/snippets/trash', {
  headers: { 'x-wallet-address': userWallet }
});
```

#### 2. Restore Button
```typescript
// Restore from trash
const restore = await fetch(`/api/snippets/${id}/restore`, {
  method: 'POST',
  headers: { 'x-wallet-address': userWallet }
});
```

#### 3. Activity Timeline
```typescript
// Show activity history
const activity = await fetch(`/api/snippets/${id}/activity`, {
  headers: { 'x-wallet-address': userWallet }
});
```

#### 4. Delete Confirmation
```typescript
// Show warning before soft delete
// "This snippet will be moved to trash and can be restored within 30 days"
```

## Testing Strategy

### Unit Tests
```typescript
// Test soft delete functionality
describe('SnippetService - Soft Delete', () => {
  it('should soft delete a snippet', async () => {
    const snippet = await service.deleteSnippet(id, wallet);
    expect(snippet.is_deleted).toBe(true);
    expect(snippet.deleted_at).toBeDefined();
  });

  it('should restore a deleted snippet', async () => {
    const restored = await service.restoreSnippet(id, wallet);
    expect(restored.is_deleted).toBe(false);
    expect(restored.deleted_at).toBeNull();
  });

  it('should not return deleted snippets in findAll', async () => {
    await service.deleteSnippet(id, wallet);
    const result = await repository.findAll();
    expect(result.data).not.toContainEqual(
      expect.objectContaining({ id })
    );
  });
});
```

### Integration Tests
```typescript
// Test API endpoints
describe('Trash API', () => {
  it('GET /api/snippets/trash should return user trash', async () => {
    const response = await fetch('/api/snippets/trash', {
      headers: { 'x-wallet-address': wallet }
    });
    expect(response.status).toBe(200);
  });

  it('POST /api/snippets/[id]/restore should restore snippet', async () => {
    const response = await fetch(`/api/snippets/${id}/restore`, {
      method: 'POST',
      headers: { 'x-wallet-address': wallet }
    });
    expect(response.status).toBe(200);
  });
});
```

### Manual Testing Checklist
- [ ] Delete a snippet → verify it appears in trash
- [ ] Restore a snippet → verify it's back in main list
- [ ] Check activity history → verify delete/restore logged
- [ ] Verify ownership → user can't restore others' snippets
- [ ] Verify pagination → trash pagination works correctly
- [ ] Check performance → queries use indexes efficiently

## Performance Considerations

### Query Optimization
1. **Active Snippets Query** - Uses `idx_snippets_active` index
   - Filters: `is_deleted = false`
   - Sorts: `created_at DESC`
   - Expected: < 50ms for 100k records

2. **Trash Query** - Uses `idx_snippets_deleted_at` index
   - Filters: `is_deleted = true AND owner_wallet_address = ?`
   - Sorts: `deleted_at DESC`
   - Expected: < 100ms for 10k deleted records

3. **Activity Logs** - Uses `idx_activity_logs_snippet_id`
   - Filters: `snippet_id = ?`
   - Sorts: `created_at DESC`
   - Expected: < 50ms for 1k activity records

### Storage Impact
- Soft-deleted snippets remain in database
- Activity logs add ~500 bytes per action
- Estimated: 1GB per 1M deleted snippets + activity logs

## Cascading Deletes

### Current Behavior
- Soft delete only marks snippet as deleted
- Related data (versions, activity logs) are preserved
- ON DELETE CASCADE only applies to hard deletes

### Future Considerations
- Comments/discussions on snippets (if added)
- Collaborator permissions (if added)
- NFT metadata (if added)

## Troubleshooting

### Issue: Deleted snippets still appear in list
**Solution:** Verify `is_deleted` column exists and migration ran successfully
```sql
SELECT COUNT(*) FROM snippets WHERE is_deleted = true;
```

### Issue: Restore fails with "Snippet not found"
**Solution:** Ensure `includeDeleted=true` parameter is passed to ownership check
```typescript
await ownershipMiddleware.verifyOwnership(id, wallet, true);
```

### Issue: Activity logs not being created
**Solution:** Check that `ActivityLogger.log()` is called in service methods
```typescript
await ActivityLogger.log(id, "DELETE", wallet, details);
```

## Future Enhancements

1. **Automatic Cleanup**
   - Permanently delete snippets after 30 days
   - Configurable retention period

2. **Bulk Operations**
   - Restore multiple snippets at once
   - Empty trash (permanent delete all)

3. **Advanced Filtering**
   - Filter trash by date range
   - Filter by deletion reason
   - Search deleted snippets

4. **Notifications**
   - Notify user when snippet is deleted
   - Remind user about items in trash

5. **Admin Dashboard**
   - View all deleted snippets across users
   - Permanent delete for compliance
   - Activity audit logs

6. **Expiration Warnings**
   - Notify user before permanent deletion
   - Show countdown timer in trash

## References

- [PostgreSQL Soft Delete Pattern](https://wiki.postgresql.org/wiki/Audit_trigger_91plus)
- [Activity Logging Best Practices](https://en.wikipedia.org/wiki/Audit_trail)
- [Data Retention Policies](https://gdpr-info.eu/art-5-gdpr/)
