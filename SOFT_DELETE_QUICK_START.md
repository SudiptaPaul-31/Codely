# Soft Delete - Quick Start Guide

## 🚀 Getting Started

### Step 1: Run Database Migration
```bash
# Connect to your database and run the migration
psql $DATABASE_URL < scripts/add-soft-delete.sql

# Verify the migration
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'snippets' AND column_name IN ('is_deleted', 'deleted_at', 'deleted_by');"
```

### Step 2: Deploy Backend Code
The following files have been created/modified:

**New Files:**
- `lib/activity-logger.ts` - Activity logging utility
- `app/api/snippets/trash/route.ts` - Trash endpoint
- `app/api/snippets/[id]/restore/route.ts` - Restore endpoint
- `app/api/snippets/[id]/activity/route.ts` - Activity history endpoint
- `scripts/add-soft-delete.sql` - Database migration

**Modified Files:**
- `app/api/snippets/snippet.repository.ts` - Added soft delete methods
- `app/api/snippets/snippet.service.ts` - Added soft delete service methods
- `app/api/snippets/[id]/route.ts` - Updated DELETE to use soft delete
- `app/api/snippets/ownership.middleware.ts` - Added includeDeleted parameter

### Step 3: Test Backend Endpoints

#### Delete a Snippet (Soft Delete)
```bash
curl -X DELETE http://localhost:3000/api/snippets/{snippet-id} \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"
```

#### View Trash
```bash
curl http://localhost:3000/api/snippets/trash \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"
```

#### Restore a Snippet
```bash
curl -X POST http://localhost:3000/api/snippets/{snippet-id}/restore \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"
```

#### View Activity History
```bash
curl http://localhost:3000/api/snippets/{snippet-id}/activity \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"
```

### Step 4: Implement Frontend Components

Create these React components:

1. **TrashSection** - Display deleted snippets
2. **DeleteConfirmationDialog** - Confirm before delete
3. **ActivityTimeline** - Show activity history
4. **Updated SnippetCard** - Add delete button

See `SOFT_DELETE_FRONTEND.md` for complete implementation examples.

## 📋 API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| DELETE | `/api/snippets/[id]` | Soft delete a snippet |
| GET | `/api/snippets/trash` | Get user's deleted snippets |
| POST | `/api/snippets/[id]/restore` | Restore a deleted snippet |
| GET | `/api/snippets/[id]/activity` | Get activity history |

### Request Headers
All endpoints require:
```
x-wallet-address: <user-wallet-address>
```

### Response Examples

#### Delete Response
```json
{
  "message": "Snippet deleted successfully",
  "note": "Snippet moved to trash. You can restore it from the trash section."
}
```

#### Trash Response
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "My Snippet",
      "description": "Description",
      "language": "javascript",
      "deleted_at": "2026-05-26T10:30:00Z",
      "deleted_by": "GXXXXXX...",
      "is_deleted": true
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

#### Restore Response
```json
{
  "message": "Snippet restored successfully",
  "snippet": {
    "id": "uuid",
    "title": "My Snippet",
    "is_deleted": false,
    "deleted_at": null,
    "deleted_by": null
  }
}
```

#### Activity Response
```json
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
    }
  ],
  "total": 1
}
```

## 🧪 Testing

### Quick Test Scenario
```bash
# 1. Create a snippet
SNIPPET_ID=$(curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7" \
  -d '{
    "title": "Test",
    "description": "Test",
    "code": "console.log(\"test\");",
    "language": "javascript",
    "tags": ["test"]
  }' | jq -r '.id')

# 2. Delete the snippet
curl -X DELETE http://localhost:3000/api/snippets/$SNIPPET_ID \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# 3. Verify it's in trash
curl http://localhost:3000/api/snippets/trash \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# 4. Restore it
curl -X POST http://localhost:3000/api/snippets/$SNIPPET_ID/restore \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"

# 5. View activity
curl http://localhost:3000/api/snippets/$SNIPPET_ID/activity \
  -H "x-wallet-address: GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMUF6NS4ZGKYYWRYNX6YJGW7"
```

### Run Test Suite
```bash
npm test -- soft-delete
npm test -- activity-logger
npm test -- --testPathPattern=integration
```

## 📊 Database Schema

### New Columns in `snippets`
```sql
is_deleted BOOLEAN DEFAULT FALSE
deleted_at TIMESTAMP
deleted_by VARCHAR(255)
```

### New `activity_logs` Table
```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  user_wallet_address VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes Created
- `idx_snippets_is_deleted` - Filter active snippets
- `idx_snippets_deleted_at` - Sort deleted snippets
- `idx_snippets_active` - Combined index for active queries
- `idx_activity_logs_snippet_id` - Activity log queries
- `idx_activity_logs_action` - Filter by action
- `idx_activity_logs_created_at` - Sort by date
- `idx_activity_logs_user` - User activity queries

## 🔒 Security

### Ownership Verification
- Users can only restore their own snippets
- Users can only view their own trash
- Wallet address is verified from request headers

### Activity Logging
- All delete/restore actions are logged
- Includes user wallet address and timestamp
- Immutable audit trail

## 🎯 Key Features

✅ **Soft Delete** - Snippets marked as deleted, not removed
✅ **Trash Management** - View and manage deleted snippets
✅ **Restore Functionality** - Recover deleted snippets
✅ **Activity Logging** - Complete audit trail
✅ **Ownership Verification** - Secure access control
✅ **Performance Optimized** - Efficient queries with indexes
✅ **Pagination Support** - Handle large trash
✅ **Error Handling** - Clear error messages

## 📚 Documentation

- **`SOFT_DELETE_IMPLEMENTATION.md`** - Complete technical documentation
- **`SOFT_DELETE_TESTING.md`** - Comprehensive testing guide
- **`SOFT_DELETE_FRONTEND.md`** - Frontend integration guide
- **`SOFT_DELETE_SUMMARY.md`** - Implementation summary

## 🐛 Troubleshooting

### Issue: Deleted snippets still appear in list
**Solution:** Verify migration ran and `is_deleted` column exists
```sql
SELECT COUNT(*) FROM snippets WHERE is_deleted = true;
```

### Issue: Restore fails with "Snippet not found"
**Solution:** Ensure `includeDeleted=true` in ownership check

### Issue: Activity logs not being created
**Solution:** Verify `activity_logs` table exists and `ActivityLogger.log()` is called

## 🚀 Next Steps

1. ✅ Run database migration
2. ✅ Deploy backend code
3. ⏳ Implement frontend components
4. ⏳ Run comprehensive tests
5. ⏳ Deploy to production

## 📞 Support

For detailed information, refer to:
- Technical details: `SOFT_DELETE_IMPLEMENTATION.md`
- Testing guide: `SOFT_DELETE_TESTING.md`
- Frontend guide: `SOFT_DELETE_FRONTEND.md`

## ✨ Features Coming Soon

- Automatic cleanup (permanent delete after 30 days)
- Bulk restore/delete operations
- Advanced trash filtering
- User notifications
- Admin dashboard
- Expiration warnings
