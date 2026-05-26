# Soft Delete Testing Guide

## Test Scenarios

### 1. Basic Soft Delete Flow

#### Test 1.1: Delete a Snippet
```bash
# Create a snippet first
curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7" \
  -d '{
    "title": "Test Snippet",
    "description": "Test description",
    "code": "console.log(\"hello\");",
    "language": "javascript",
    "tags": ["test"]
  }'

# Response: { "id": "abc123", "title": "Test Snippet", ... }

# Delete the snippet
curl -X DELETE http://localhost:3000/api/snippets/abc123 \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected Response:
# {
#   "message": "Snippet deleted successfully",
#   "note": "Snippet moved to trash. You can restore it from the trash section."
# }
```

**Verification:**
- Snippet should not appear in `/api/snippets` list
- Snippet should appear in `/api/snippets/trash`
- `is_deleted` should be `true` in database
- `deleted_at` should be set to current timestamp

#### Test 1.2: Verify Deleted Snippet Not in Main List
```bash
curl http://localhost:3000/api/snippets \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected: Deleted snippet should NOT be in the response
```

### 2. Trash Management

#### Test 2.1: View Trash
```bash
curl http://localhost:3000/api/snippets/trash \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected Response:
# {
#   "data": [
#     {
#       "id": "abc123",
#       "title": "Test Snippet",
#       "deleted_at": "2026-05-26T10:30:00Z",
#       "deleted_by": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7",
#       ...
#     }
#   ],
#   "pagination": {
#     "total": 1,
#     "limit": 20,
#     "offset": 0,
#     "hasMore": false
#   }
# }
```

#### Test 2.2: Trash Pagination
```bash
# Create multiple deleted snippets
for i in {1..25}; do
  # Create and delete snippets
done

# Test pagination
curl "http://localhost:3000/api/snippets/trash?limit=10&offset=0" \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected: First 10 items, hasMore=true

curl "http://localhost:3000/api/snippets/trash?limit=10&offset=10" \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected: Next 10 items
```

### 3. Restore Functionality

#### Test 3.1: Restore a Deleted Snippet
```bash
curl -X POST http://localhost:3000/api/snippets/abc123/restore \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected Response:
# {
#   "message": "Snippet restored successfully",
#   "snippet": {
#     "id": "abc123",
#     "title": "Test Snippet",
#     "is_deleted": false,
#     "deleted_at": null,
#     ...
#   }
# }
```

**Verification:**
- Snippet should reappear in `/api/snippets` list
- Snippet should NOT appear in `/api/snippets/trash`
- `is_deleted` should be `false`
- `deleted_at` should be `null`

#### Test 3.2: Restore Non-Deleted Snippet (Error Case)
```bash
# Try to restore a snippet that's not deleted
curl -X POST http://localhost:3000/api/snippets/active-snippet-id/restore \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected Response (400):
# {
#   "error": "Snippet is not deleted"
# }
```

### 4. Activity Logging

#### Test 4.1: View Activity History
```bash
curl http://localhost:3000/api/snippets/abc123/activity \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected Response:
# {
#   "snippetId": "abc123",
#   "activities": [
#     {
#       "id": "log-uuid-1",
#       "action": "DELETE",
#       "userWalletAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7",
#       "details": {
#         "title": "Test Snippet",
#         "language": "javascript",
#         "deletedAt": "2026-05-26T10:30:00Z"
#       },
#       "createdAt": "2026-05-26T10:30:00Z"
#     },
#     {
#       "id": "log-uuid-2",
#       "action": "RESTORE",
#       "userWalletAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7",
#       "details": {
#         "title": "Test Snippet",
#         "language": "javascript",
#         "restoredAt": "2026-05-26T10:35:00Z"
#       },
#       "createdAt": "2026-05-26T10:35:00Z"
#     }
#   ],
#   "total": 2
# }
```

#### Test 4.2: Activity Logging Accuracy
```bash
# Verify activity logs are created for each action
# 1. Create snippet → should log CREATE
# 2. Update snippet → should log UPDATE
# 3. Delete snippet → should log DELETE
# 4. Restore snippet → should log RESTORE

# Check database directly
SELECT * FROM activity_logs 
WHERE snippet_id = 'abc123' 
ORDER BY created_at DESC;

# Expected: 4 rows with actions: RESTORE, DELETE, UPDATE, CREATE
```

### 5. Ownership & Permissions

#### Test 5.1: User Can Only Restore Own Snippets
```bash
# User A creates and deletes a snippet
WALLET_A="GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"
WALLET_B="GBXYZ123456789..."

# User A deletes snippet
curl -X DELETE http://localhost:3000/api/snippets/abc123 \
  -H "x-wallet-address: $WALLET_A"

# User B tries to restore it
curl -X POST http://localhost:3000/api/snippets/abc123/restore \
  -H "x-wallet-address: $WALLET_B"

# Expected Response (403):
# {
#   "error": "Unauthorized",
#   "message": "You are not the owner of this snippet."
# }
```

#### Test 5.2: User Can Only View Own Trash
```bash
# User A's trash
curl http://localhost:3000/api/snippets/trash \
  -H "x-wallet-address: $WALLET_A"

# User B's trash
curl http://localhost:3000/api/snippets/trash \
  -H "x-wallet-address: $WALLET_B"

# Expected: Each user only sees their own deleted snippets
```

### 6. Error Cases

#### Test 6.1: Restore Non-Existent Snippet
```bash
curl -X POST http://localhost:3000/api/snippets/non-existent-id/restore \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# Expected Response (404):
# {
#   "error": "Snippet not found"
# }
```

#### Test 6.2: Missing Wallet Address
```bash
curl -X POST http://localhost:3000/api/snippets/abc123/restore

# Expected Response (401):
# {
#   "error": "Unauthorized",
#   "message": "Wallet address is required."
# }
```

#### Test 6.3: Invalid Wallet Address Format
```bash
curl -X POST http://localhost:3000/api/snippets/abc123/restore \
  -H "x-wallet-address: invalid-wallet"

# Expected Response (401):
# {
#   "error": "Unauthorized",
#   "message": "Wallet address is required."
# }
```

### 7. Database Verification

#### Test 7.1: Verify Schema
```sql
-- Check soft delete columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'snippets' 
AND column_name IN ('is_deleted', 'deleted_at', 'deleted_by')
ORDER BY ordinal_position;

-- Expected output:
-- is_deleted | boolean | NO
-- deleted_at | timestamp without time zone | YES
-- deleted_by | character varying | YES
```

#### Test 7.2: Verify Indexes
```sql
-- Check indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'snippets' 
AND indexname LIKE 'idx_snippets_%';

-- Expected indexes:
-- idx_snippets_is_deleted
-- idx_snippets_deleted_at
-- idx_snippets_active
-- idx_snippets_language
-- idx_snippets_created_at
```

#### Test 7.3: Verify Activity Logs Table
```sql
-- Check activity_logs table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'activity_logs' 
ORDER BY ordinal_position;

-- Expected columns:
-- id | uuid
-- snippet_id | uuid
-- action | character varying
-- user_wallet_address | character varying
-- details | jsonb
-- created_at | timestamp without time zone
```

### 8. Performance Tests

#### Test 8.1: Query Performance - Active Snippets
```sql
-- Measure query time for active snippets
EXPLAIN ANALYZE
SELECT * FROM snippets 
WHERE is_deleted = false 
ORDER BY created_at DESC 
LIMIT 20;

-- Expected: < 50ms for 100k records
-- Should use idx_snippets_active index
```

#### Test 8.2: Query Performance - Trash
```sql
-- Measure query time for trash
EXPLAIN ANALYZE
SELECT * FROM snippets 
WHERE is_deleted = true 
AND owner_wallet_address = 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7'
ORDER BY deleted_at DESC 
LIMIT 20;

-- Expected: < 100ms for 10k deleted records
-- Should use idx_snippets_deleted_at index
```

#### Test 8.3: Query Performance - Activity Logs
```sql
-- Measure query time for activity logs
EXPLAIN ANALYZE
SELECT * FROM activity_logs 
WHERE snippet_id = 'abc123' 
ORDER BY created_at DESC 
LIMIT 50;

-- Expected: < 50ms for 1k activity records
-- Should use idx_activity_logs_snippet_id index
```

## Automated Test Suite

### Unit Tests (Jest)
```typescript
// lib/activity-logger.test.ts
describe('ActivityLogger', () => {
  it('should log delete action', async () => {
    const log = await ActivityLogger.log(
      'snippet-id',
      'DELETE',
      'wallet-address',
      { title: 'Test' }
    );
    expect(log.action).toBe('DELETE');
    expect(log.snippetId).toBe('snippet-id');
  });

  it('should retrieve snippet history', async () => {
    const history = await ActivityLogger.getSnippetHistory('snippet-id');
    expect(Array.isArray(history)).toBe(true);
  });
});

// app/api/snippets/snippet.repository.test.ts
describe('SnippetRepository - Soft Delete', () => {
  it('should soft delete a snippet', async () => {
    const deleted = await repository.softDelete('snippet-id', 'wallet');
    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();
  });

  it('should restore a snippet', async () => {
    const restored = await repository.restore('snippet-id');
    expect(restored.is_deleted).toBe(false);
    expect(restored.deleted_at).toBeNull();
  });

  it('should not return deleted snippets in findAll', async () => {
    await repository.softDelete('snippet-id', 'wallet');
    const result = await repository.findAll();
    expect(result.data).not.toContainEqual(
      expect.objectContaining({ id: 'snippet-id' })
    );
  });

  it('should return deleted snippets in findDeletedByUser', async () => {
    await repository.softDelete('snippet-id', 'wallet');
    const result = await repository.findDeletedByUser('wallet');
    expect(result.data).toContainEqual(
      expect.objectContaining({ id: 'snippet-id' })
    );
  });
});
```

### Integration Tests
```typescript
// __tests__/api/soft-delete.integration.test.ts
describe('Soft Delete API Integration', () => {
  const wallet = 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7';
  let snippetId: string;

  beforeAll(async () => {
    // Create a test snippet
    const response = await fetch('http://localhost:3000/api/snippets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': wallet,
      },
      body: JSON.stringify({
        title: 'Test Snippet',
        description: 'Test',
        code: 'console.log("test");',
        language: 'javascript',
        tags: ['test'],
      }),
    });
    const data = await response.json();
    snippetId = data.id;
  });

  it('should delete snippet and move to trash', async () => {
    const response = await fetch(
      `http://localhost:3000/api/snippets/${snippetId}`,
      {
        method: 'DELETE',
        headers: { 'x-wallet-address': wallet },
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toContain('deleted successfully');
  });

  it('should show deleted snippet in trash', async () => {
    const response = await fetch('http://localhost:3000/api/snippets/trash', {
      headers: { 'x-wallet-address': wallet },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toContainEqual(
      expect.objectContaining({ id: snippetId })
    );
  });

  it('should restore deleted snippet', async () => {
    const response = await fetch(
      `http://localhost:3000/api/snippets/${snippetId}/restore`,
      {
        method: 'POST',
        headers: { 'x-wallet-address': wallet },
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.snippet.is_deleted).toBe(false);
  });

  it('should show activity history', async () => {
    const response = await fetch(
      `http://localhost:3000/api/snippets/${snippetId}/activity`,
      {
        headers: { 'x-wallet-address': wallet },
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.activities.length).toBeGreaterThan(0);
    expect(data.activities).toContainEqual(
      expect.objectContaining({ action: 'DELETE' })
    );
    expect(data.activities).toContainEqual(
      expect.objectContaining({ action: 'RESTORE' })
    );
  });
});
```

## Test Execution

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm test -- soft-delete
npm test -- activity-logger
```

### Run Integration Tests Only
```bash
npm test -- --testPathPattern=integration
```

### Run with Coverage
```bash
npm test -- --coverage
```

## Checklist for QA

- [ ] Soft delete moves snippet to trash
- [ ] Deleted snippets don't appear in main list
- [ ] Trash view shows all deleted snippets
- [ ] Restore functionality works correctly
- [ ] Activity history logs all actions
- [ ] Ownership verification prevents unauthorized restore
- [ ] Pagination works in trash view
- [ ] Error messages are clear and helpful
- [ ] Performance is acceptable (< 100ms for queries)
- [ ] Database indexes are being used
- [ ] No data loss during soft delete
- [ ] Concurrent operations don't cause issues
- [ ] Mobile UI works with new endpoints
- [ ] Wallet address validation works
