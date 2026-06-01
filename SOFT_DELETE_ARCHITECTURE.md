# Soft Delete Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Frontend)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React Components                                        │   │
│  │  ├─ SnippetCard (with delete button)                    │   │
│  │  ├─ DeleteConfirmationDialog                            │   │
│  │  ├─ TrashSection (view deleted snippets)                │   │
│  │  ├─ ActivityTimeline (show history)                     │   │
│  │  └─ Navbar (with trash link)                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    HTTP Requests/Responses
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    API LAYER (Next.js)                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  DELETE /api/snippets/[id]                              │   │
│  │  ├─ Extract wallet address                              │   │
│  │  ├─ Verify ownership                                    │   │
│  │  └─ Call service.deleteSnippet()                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GET /api/snippets/trash                                │   │
│  │  ├─ Extract wallet address                              │   │
│  │  └─ Call service.getUserTrash()                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  POST /api/snippets/[id]/restore                        │   │
│  │  ├─ Extract wallet address                              │   │
│  │  ├─ Verify ownership (includeDeleted=true)              │   │
│  │  └─ Call service.restoreSnippet()                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GET /api/snippets/[id]/activity                        │   │
│  │  ├─ Extract wallet address                              │   │
│  │  └─ Call ActivityLogger.getSnippetHistory()             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SnippetService                                          │   │
│  │  ├─ deleteSnippet(id, wallet)                           │   │
│  │  │  ├─ Call repository.softDelete()                     │   │
│  │  │  └─ Call ActivityLogger.log('DELETE')                │   │
│  │  ├─ restoreSnippet(id, wallet)                          │   │
│  │  │  ├─ Call repository.restore()                        │   │
│  │  │  └─ Call ActivityLogger.log('RESTORE')               │   │
│  │  ├─ getUserTrash(wallet, options)                       │   │
│  │  │  └─ Call repository.findDeletedByUser()              │   │
│  │  └─ getAllDeletedSnippets(options)                      │   │
│  │     └─ Call repository.findAllDeleted()                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ActivityLogger                                          │   │
│  │  ├─ log(snippetId, action, wallet, details)             │   │
│  │  ├─ getSnippetHistory(snippetId)                        │   │
│  │  ├─ getUserActivity(wallet)                             │   │
│  │  └─ getUserDeleteActions(wallet)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    REPOSITORY LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SnippetRepository                                       │   │
│  │  ├─ findAll() - excludes is_deleted=true                │   │
│  │  ├─ findById() - excludes is_deleted=true               │   │
│  │  ├─ softDelete(id, wallet) - sets is_deleted=true       │   │
│  │  ├─ restore(id) - sets is_deleted=false                 │   │
│  │  ├─ findDeletedByUser(wallet) - returns deleted         │   │
│  │  ├─ findAllDeleted() - returns all deleted              │   │
│  │  └─ permanentlyDelete(id) - hard delete                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL Database                                     │   │
│  │  ├─ snippets table                                       │   │
│  │  │  ├─ id (UUID)                                         │   │
│  │  │  ├─ title (VARCHAR)                                   │   │
│  │  │  ├─ code (TEXT)                                       │   │
│  │  │  ├─ language (VARCHAR)                                │   │
│  │  │  ├─ owner_wallet_address (VARCHAR)                    │   │
│  │  │  ├─ is_deleted (BOOLEAN) ← NEW                        │   │
│  │  │  ├─ deleted_at (TIMESTAMP) ← NEW                      │   │
│  │  │  ├─ deleted_by (VARCHAR) ← NEW                        │   │
│  │  │  ├─ created_at (TIMESTAMP)                            │   │
│  │  │  └─ updated_at (TIMESTAMP)                            │   │
│  │  └─ activity_logs table ← NEW                            │   │
│  │     ├─ id (UUID)                                         │   │
│  │     ├─ snippet_id (UUID)                                 │   │
│  │     ├─ action (VARCHAR)                                  │   │
│  │     ├─ user_wallet_address (VARCHAR)                     │   │
│  │     ├─ details (JSONB)                                   │   │
│  │     └─ created_at (TIMESTAMP)                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Indexes (Performance Optimization)                      │   │
│  │  ├─ idx_snippets_is_deleted                              │   │
│  │  ├─ idx_snippets_deleted_at                              │   │
│  │  ├─ idx_snippets_active                                  │   │
│  │  ├─ idx_activity_logs_snippet_id                         │   │
│  │  ├─ idx_activity_logs_action                             │   │
│  │  ├─ idx_activity_logs_created_at                         │   │
│  │  └─ idx_activity_logs_user                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Delete Flow
```
User clicks Delete
        ↓
DeleteConfirmationDialog shows
        ↓
User confirms
        ↓
DELETE /api/snippets/[id]
        ↓
OwnershipMiddleware.verifyOwnership()
        ↓
SnippetService.deleteSnippet()
        ↓
SnippetRepository.softDelete()
        ↓
UPDATE snippets SET is_deleted=true, deleted_at=NOW(), deleted_by=wallet
        ↓
ActivityLogger.log('DELETE', ...)
        ↓
INSERT INTO activity_logs (action='DELETE', ...)
        ↓
Response: "Snippet moved to trash"
        ↓
UI updates: Remove from list, show in trash
```

### Restore Flow
```
User views trash
        ↓
GET /api/snippets/trash
        ↓
SnippetService.getUserTrash()
        ↓
SnippetRepository.findDeletedByUser()
        ↓
SELECT * FROM snippets WHERE is_deleted=true AND owner_wallet_address=wallet
        ↓
Display deleted snippets
        ↓
User clicks Restore
        ↓
POST /api/snippets/[id]/restore
        ↓
OwnershipMiddleware.verifyOwnership(includeDeleted=true)
        ↓
SnippetService.restoreSnippet()
        ↓
SnippetRepository.restore()
        ↓
UPDATE snippets SET is_deleted=false, deleted_at=null, deleted_by=null
        ↓
ActivityLogger.log('RESTORE', ...)
        ↓
INSERT INTO activity_logs (action='RESTORE', ...)
        ↓
Response: "Snippet restored"
        ↓
UI updates: Remove from trash, show in main list
```

### Activity History Flow
```
User views snippet details
        ↓
GET /api/snippets/[id]/activity
        ↓
ActivityLogger.getSnippetHistory(snippetId)
        ↓
SELECT * FROM activity_logs WHERE snippet_id=? ORDER BY created_at DESC
        ↓
Display timeline with:
  - CREATE action
  - UPDATE actions
  - DELETE action
  - RESTORE action
        ↓
Show user, timestamp, and details for each action
```

## Query Filtering Strategy

### Active Snippets Query
```sql
-- Before (returns all)
SELECT * FROM snippets ORDER BY created_at DESC;

-- After (excludes soft-deleted)
SELECT * FROM snippets 
WHERE is_deleted = false 
ORDER BY created_at DESC;

-- Uses index: idx_snippets_active
```

### Trash Query
```sql
-- Get user's deleted snippets
SELECT * FROM snippets 
WHERE is_deleted = true 
  AND owner_wallet_address = $1 
ORDER BY deleted_at DESC;

-- Uses index: idx_snippets_deleted_at
```

### Activity Query
```sql
-- Get activity for a snippet
SELECT * FROM activity_logs 
WHERE snippet_id = $1 
ORDER BY created_at DESC;

-- Uses index: idx_activity_logs_snippet_id
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                               │
├─────────────────────────────────────────────────────────────────┤
│ 1. AUTHENTICATION                                                │
│    └─ Wallet address extracted from request headers              │
│       └─ Validated format (starts with 'G', length >= 56)        │
├─────────────────────────────────────────────────────────────────┤
│ 2. AUTHORIZATION (OwnershipMiddleware)                           │
│    └─ Verify wallet owns the snippet                             │
│       ├─ For active snippets: is_deleted = false                 │
│       └─ For deleted snippets: includeDeleted = true             │
├─────────────────────────────────────────────────────────────────┤
│ 3. AUDIT LOGGING (ActivityLogger)                                │
│    └─ Log all delete/restore actions                             │
│       ├─ User wallet address                                     │
│       ├─ Action type                                             │
│       ├─ Timestamp                                               │
│       └─ Action details (JSON)                                   │
├─────────────────────────────────────────────────────────────────┤
│ 4. DATA PROTECTION                                               │
│    └─ Soft delete preserves data                                 │
│       ├─ No permanent data loss                                  │
│       ├─ Recovery possible                                       │
│       └─ Audit trail maintained                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE OPTIMIZATION                      │
├─────────────────────────────────────────────────────────────────┤
│ INDEXES                                                          │
│ ├─ idx_snippets_is_deleted                                       │
│ │  └─ Fast filtering of active vs deleted                        │
│ ├─ idx_snippets_deleted_at                                       │
│ │  └─ Fast sorting of deleted snippets                           │
│ ├─ idx_snippets_active (composite)                               │
│ │  └─ Fast query: is_deleted=false + created_at DESC             │
│ └─ idx_activity_logs_* (multiple)                                │
│    └─ Fast activity log queries                                  │
├─────────────────────────────────────────────────────────────────┤
│ QUERY OPTIMIZATION                                               │
│ ├─ Active snippets: < 50ms (100k records)                        │
│ ├─ Trash query: < 100ms (10k deleted)                            │
│ ├─ Activity logs: < 50ms (1k records)                            │
│ └─ Pagination: Limit + Offset                                    │
├─────────────────────────────────────────────────────────────────┤
│ CACHING OPPORTUNITIES                                            │
│ ├─ Cache trash count per user                                    │
│ ├─ Cache activity history                                        │
│ └─ Invalidate on delete/restore                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    FRONTEND COMPONENTS                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  SnippetCard                                                      │
│  ├─ Displays snippet                                              │
│  ├─ Delete button                                                 │
│  └─ onClick → DeleteConfirmationDialog                            │
│                                                                   │
│  DeleteConfirmationDialog                                         │
│  ├─ Shows warning                                                 │
│  ├─ Confirm button                                                │
│  └─ onClick → DELETE /api/snippets/[id]                           │
│                                                                   │
│  TrashSection                                                     │
│  ├─ Lists deleted snippets                                        │
│  ├─ GET /api/snippets/trash                                       │
│  ├─ Restore button per item                                       │
│  └─ onClick → POST /api/snippets/[id]/restore                     │
│                                                                   │
│  ActivityTimeline                                                 │
│  ├─ Shows activity history                                        │
│  ├─ GET /api/snippets/[id]/activity                               │
│  └─ Displays timeline with actions                                │
│                                                                   │
│  Navbar                                                           │
│  ├─ Snippets link                                                 │
│  ├─ Trash link                                                    │
│  └─ Shows trash count (optional)                                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## State Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATE MANAGEMENT                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Global State (if using Redux/Zustand)                            │
│  ├─ snippets: Snippet[]                                           │
│  ├─ trash: Snippet[]                                              │
│  ├─ activities: ActivityLog[]                                     │
│  └─ loading: boolean                                              │
│                                                                   │
│  Component State                                                  │
│  ├─ TrashSection                                                  │
│  │  ├─ trash: DeletedSnippet[]                                    │
│  │  ├─ pagination: PaginationState                                │
│  │  └─ loading: boolean                                           │
│  ├─ ActivityTimeline                                              │
│  │  ├─ activities: ActivityLog[]                                  │
│  │  └─ loading: boolean                                           │
│  └─ DeleteConfirmationDialog                                      │
│     ├─ open: boolean                                              │
│     └─ isDeleting: boolean                                        │
│                                                                   │
│  Actions                                                          │
│  ├─ deleteSnippet(id)                                             │
│  │  └─ DELETE /api/snippets/[id]                                  │
│  ├─ restoreSnippet(id)                                            │
│  │  └─ POST /api/snippets/[id]/restore                            │
│  ├─ fetchTrash()                                                  │
│  │  └─ GET /api/snippets/trash                                    │
│  └─ fetchActivity(id)                                             │
│     └─ GET /api/snippets/[id]/activity                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  API Error                                                        │
│  ├─ 400: Validation error                                         │
│  ├─ 401: Unauthorized (missing wallet)                            │
│  ├─ 403: Forbidden (not owner)                                    │
│  ├─ 404: Not found                                                │
│  └─ 500: Server error                                             │
│                                                                   │
│  Frontend Error Handling                                          │
│  ├─ Catch API errors                                              │
│  ├─ Display user-friendly message                                 │
│  ├─ Log to error tracking                                         │
│  └─ Retry logic (optional)                                        │
│                                                                   │
│  Database Error Handling                                          │
│  ├─ Connection errors                                             │
│  ├─ Query errors                                                  │
│  ├─ Constraint violations                                         │
│  └─ Timeout errors                                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT STAGES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Development                                                      │
│  ├─ Local database                                                │
│  ├─ Local API server                                              │
│  └─ Local frontend                                                │
│                                                                   │
│  Staging                                                          │
│  ├─ Staging database (with backup)                                │
│  ├─ Staging API server                                            │
│  ├─ Staging frontend                                              │
│  └─ QA testing                                                    │
│                                                                   │
│  Production                                                       │
│  ├─ Production database (with backup)                             │
│  ├─ Production API server (load balanced)                         │
│  ├─ Production frontend (CDN)                                     │
│  └─ Monitoring & alerts                                           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONITORING                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Metrics                                                          │
│  ├─ Delete operations per day                                     │
│  ├─ Restore operations per day                                    │
│  ├─ Trash size per user                                           │
│  ├─ Activity log growth                                           │
│  └─ Query performance                                             │
│                                                                   │
│  Logs                                                             │
│  ├─ API request logs                                              │
│  ├─ Database query logs                                           │
│  ├─ Error logs                                                    │
│  └─ Activity logs                                                 │
│                                                                   │
│  Alerts                                                           │
│  ├─ High error rate                                               │
│  ├─ Slow queries                                                  │
│  ├─ Database connection issues                                    │
│  └─ Disk space warnings                                           │
│                                                                   │
│  Dashboards                                                       │
│  ├─ Soft delete operations                                        │
│  ├─ Trash statistics                                              │
│  ├─ Performance metrics                                           │
│  └─ Error tracking                                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

This architecture ensures:
- ✅ Data integrity and recovery
- ✅ Security and access control
- ✅ Performance and scalability
- ✅ Auditability and compliance
- ✅ User experience and reliability
