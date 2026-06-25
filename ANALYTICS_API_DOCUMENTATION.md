# Snippet Analytics API Documentation

## Overview

The Snippet Analytics Service tracks user interactions with snippets (views, copies, shares) and provides aggregated analytics data for dashboards and reporting. The service features reliable event logging with automatic retry logic and efficient database queries.

## Features

- ✅ **Reliable Event Logging**: Tracks views, copies, and shares with exponential backoff retry logic
- ✅ **User Tracking**: Records both authenticated and anonymous user interactions
- ✅ **Aggregated Queries**: Efficient aggregation of analytics data with database indexes
- ✅ **Time-Series Analytics**: Support for date-range filtering and time-based analysis
- ✅ **Global Analytics**: Dashboard-friendly aggregation across all snippets
- ✅ **Append-Only**: Analytics data is immutable for audit trail compliance

---

## API Endpoints

### 1. Log Snippet Action

**Endpoint**: `POST /api/snippets/:id/analytics`

Log a user action for a specific snippet (view, copy, or share).

#### Request Body

```json
{
  "actionType": "view|copy|share",
  "userWallet": "GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74",
  "metadata": {
    "referrer": "search",
    "method": "link"
  }
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actionType` | string | Yes | Action type: `view`, `copy`, or `share` |
| `userWallet` | string | No | Wallet address of authenticated user; null for anonymous |
| `metadata` | object | No | Action-specific metadata (e.g., copy format, share method) |

#### Response (201 Created)

```json
{
  "success": true,
  "message": "view action logged successfully",
  "event": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "snippet_id": "abc123",
    "user_wallet": "GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74",
    "action_type": "view",
    "metadata": { "referrer": "search" },
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### Error Responses

**400 Bad Request** - Invalid action type:
```json
{
  "error": "Invalid action type",
  "message": "actionType must be one of: view, copy, share"
}
```

**500 Internal Server Error** - Logging failed after retries:
```json
{
  "error": "Failed to log analytics",
  "message": "Failed to log analytics event after 3 attempts: ..."
}
```

#### Example Usage

```javascript
// Log a view
fetch('/api/snippets/abc123/analytics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    actionType: 'view',
    userWallet: 'GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74',
    metadata: { referrer: 'search' }
  })
});

// Log a copy
fetch('/api/snippets/abc123/analytics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    actionType: 'copy',
    metadata: { format: 'text' }
  })
});

// Log a share
fetch('/api/snippets/abc123/analytics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    actionType: 'share',
    userWallet: 'GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74',
    metadata: { method: 'link' }
  })
});
```

---

### 2. Fetch Snippet Analytics

**Endpoint**: `GET /api/snippets/:id/analytics`

Retrieve aggregated analytics for a specific snippet.

#### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | number | 100 | 1000 | Number of recent events to return |
| `offset` | number | 0 | - | Pagination offset |
| `startDate` | ISO 8601 | - | - | Filter events after this date |
| `endDate` | ISO 8601 | - | - | Filter events before this date |

#### Response (200 OK)

```json
{
  "snippetId": "abc123",
  "summary": {
    "views": 150,
    "copies": 42,
    "shares": 18,
    "total": 210
  },
  "recentEvents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "snippet_id": "abc123",
      "user_wallet": "GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74",
      "action_type": "view",
      "metadata": { "referrer": "search" },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "eventsCount": 42
}
```

#### Example Usage

```javascript
// Get basic analytics
fetch('/api/snippets/abc123/analytics')
  .then(r => r.json())
  .then(data => {
    console.log(`Views: ${data.summary.views}`);
    console.log(`Copies: ${data.summary.copies}`);
    console.log(`Shares: ${data.summary.shares}`);
  });

// Get analytics for last 7 days
const now = new Date();
const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

fetch(`/api/snippets/abc123/analytics?startDate=${week.toISOString()}&endDate=${now.toISOString()}`)
  .then(r => r.json())
  .then(data => console.log(data));

// Paginate events
fetch('/api/snippets/abc123/analytics?limit=50&offset=100')
  .then(r => r.json())
  .then(data => console.log(data.recentEvents));
```

---

### 3. Global Analytics Summary

**Endpoint**: `GET /api/analytics`

Retrieve global analytics data for dashboard and reporting.

#### Query Parameters

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `type` | string | `summary` | `summary`, `top-viewed`, `top-copied`, `top-shared` | Analytics type |
| `limit` | number | 10 | 1-100 | Number of results for top snippets |

#### Response - Summary (200 OK)

```json
{
  "summary": {
    "totalViews": 15420,
    "totalCopies": 4230,
    "totalShares": 1890,
    "totalActions": 21540
  }
}
```

#### Response - Top Viewed Snippets (200 OK)

```json
{
  "type": "top-viewed",
  "limit": 10,
  "snippets": [
    {
      "snippet_id": "abc123",
      "title": "React Hooks Tutorial",
      "view_count": 1250
    },
    {
      "snippet_id": "def456",
      "title": "TypeScript Generics",
      "view_count": 980
    }
  ]
}
```

#### Response - Top Copied Snippets (200 OK)

```json
{
  "type": "top-copied",
  "limit": 10,
  "snippets": [
    {
      "snippet_id": "abc123",
      "title": "React Hooks Tutorial",
      "copy_count": 420
    }
  ]
}
```

#### Response - Top Shared Snippets (200 OK)

```json
{
  "type": "top-shared",
  "limit": 10,
  "snippets": [
    {
      "snippet_id": "abc123",
      "title": "React Hooks Tutorial",
      "share_count": 180
    }
  ]
}
```

#### Error Response (400 Bad Request)

```json
{
  "error": "Invalid query type",
  "message": "type must be one of: summary, top-viewed, top-copied, top-shared"
}
```

#### Example Usage

```javascript
// Get overall statistics
fetch('/api/analytics?type=summary')
  .then(r => r.json())
  .then(data => console.log('Global stats:', data.summary));

// Get top viewed snippets
fetch('/api/analytics?type=top-viewed&limit=5')
  .then(r => r.json())
  .then(data => console.log('Top 5 viewed:', data.snippets));

// Get top copied snippets
fetch('/api/analytics?type=top-copied&limit=10')
  .then(r => r.json())
  .then(data => console.log('Top 10 copied:', data.snippets));
```

---

## Database Schema

### `snippet_analytics` Table

```sql
CREATE TABLE snippet_analytics (
  id              UUID         PRIMARY KEY,
  snippet_id      UUID         NOT NULL,  -- Foreign key to snippets table
  user_wallet     VARCHAR(56),             -- Wallet address (nullable for anonymous)
  action_type     VARCHAR(20)  NOT NULL,   -- 'view', 'copy', or 'share'
  metadata        JSONB        DEFAULT '{}', -- Action-specific data
  ip_address      VARCHAR(45),              -- IPv4 or IPv6
  user_agent      TEXT,                     -- User-Agent header
  created_at      TIMESTAMPTZ  NOT NULL    -- Event timestamp
);
```

### Indexes

```sql
CREATE INDEX idx_snippet_analytics_snippet_id
CREATE INDEX idx_snippet_analytics_action_type
CREATE INDEX idx_snippet_analytics_snippet_action
CREATE INDEX idx_snippet_analytics_created
CREATE INDEX idx_snippet_analytics_user
CREATE INDEX idx_snippet_analytics_snippet_created
```

### Append-Only Guarantee

The table enforces append-only semantics through database triggers:
- `UPDATE` operations are rejected
- `DELETE` operations are rejected
- Only `INSERT` and `SELECT` are allowed

---

## Retry Logic

The service implements exponential backoff retry logic for failed analytics logging:

- **Max Retries**: 3 attempts
- **Backoff Strategy**: $2^n \times 100$ milliseconds
  - Attempt 1: Immediate
  - Attempt 2: Wait 100ms, then retry
  - Attempt 3: Wait 200ms, then retry
  - Attempt 4: Wait 400ms, then fail

This ensures that temporary database connection issues don't result in lost analytics data.

---

## Performance Considerations

### Query Optimization

- **Indexed Columns**: `snippet_id`, `action_type`, `created_at`, `user_wallet`
- **Compound Indexes**: `(snippet_id, action_type)`, `(snippet_id, created_at)`
- **Expected Query Times**:
  - Get aggregated counts: < 10ms (indexed)
  - Get recent events: < 50ms (with limit)
  - Get global top snippets: < 100ms (aggregated)

### Scaling Recommendations

For large-scale deployments (millions of events):

1. **Partition by Date**: Use `created_at` for range partitioning
2. **Archive Old Data**: Move events older than 1 year to archive tables
3. **Aggregate Tables**: Maintain pre-aggregated daily/weekly/monthly summaries
4. **Read Replicas**: Use database read replicas for analytics queries

---

## Integration Examples

### React Component - Logging View

```typescript
import { useEffect } from 'react';

export function SnippetViewer({ snippetId, userWallet }) {
  useEffect(() => {
    // Log view when snippet is opened
    fetch(`/api/snippets/${snippetId}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'view',
        userWallet: userWallet || null
      })
    }).catch(console.error);
  }, [snippetId, userWallet]);

  return <div>Snippet Content</div>;
}
```

### Copy Button with Analytics

```typescript
async function handleCopySnippet(snippetId, content) {
  await navigator.clipboard.writeText(content);
  
  // Log copy action
  fetch(`/api/snippets/${snippetId}/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType: 'copy',
      metadata: { format: 'text' }
    })
  }).catch(console.error);
}
```

### Share Button with Analytics

```typescript
async function handleShareSnippet(snippetId, userWallet) {
  const shareUrl = `${window.location.origin}/snippets/${snippetId}`;
  
  // Log share action
  fetch(`/api/snippets/${snippetId}/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType: 'share',
      userWallet: userWallet,
      metadata: { 
        method: 'link',
        url: shareUrl 
      }
    })
  }).catch(console.error);
  
  // Share using native API or custom method
  if (navigator.share) {
    await navigator.share({
      title: 'Check out this snippet',
      url: shareUrl
    });
  }
}
```

### Dashboard Analytics Display

```typescript
async function AnalyticsDashboard() {
  const [stats, setStats] = useState(null);
  const [topSnippets, setTopSnippets] = useState([]);

  useEffect(() => {
    // Fetch global statistics
    Promise.all([
      fetch('/api/analytics?type=summary').then(r => r.json()),
      fetch('/api/analytics?type=top-viewed&limit=10').then(r => r.json())
    ]).then(([summary, topViewed]) => {
      setStats(summary.summary);
      setTopSnippets(topViewed.snippets);
    });
  }, []);

  return (
    <div>
      <h2>Analytics Dashboard</h2>
      {stats && (
        <>
          <p>Total Views: {stats.totalViews}</p>
          <p>Total Copies: {stats.totalCopies}</p>
          <p>Total Shares: {stats.totalShares}</p>
        </>
      )}
      <h3>Top 10 Viewed Snippets</h3>
      <ul>
        {topSnippets.map(s => (
          <li key={s.snippet_id}>{s.title}: {s.view_count} views</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Error Handling

### Common Error Scenarios

| Status | Error | Solution |
|--------|-------|----------|
| 400 | Invalid action type | Use only: `view`, `copy`, `share` |
| 400 | Invalid snippet ID | Ensure snippet ID is a valid UUID |
| 500 | Failed after retries | Service may have database connectivity issues; retry after delay |
| 500 | Internal Server Error | Check server logs for details |

### Recommended Client-Side Handling

```typescript
async function logAnalytics(snippetId, actionType) {
  try {
    const response = await fetch(`/api/snippets/${snippetId}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Analytics error:', error);
      // Don't throw - analytics failures shouldn't affect UX
    }
  } catch (error) {
    console.error('Failed to log analytics:', error);
    // Silently fail - network issues shouldn't impact user experience
  }
}
```

---

## Testing

### Run Unit Tests

```bash
npm run test -- lib/analytics.repository.test.ts
```

### Run API Integration Tests

```bash
npm run test -- app/api/analytics/analytics.api.test.ts
```

---

## Monitoring & Logging

The service logs all analytics operations:

```
[Analytics API] Error logging action: ...
[Analytics API] Error fetching analytics: ...
[Global Analytics API] Error fetching analytics: ...
```

Monitor for:
- Repeated 500 errors (database connectivity)
- 400 errors (client-side validation failures)
- Latency spikes (performance degradation)

---

## Migration Instructions

### 1. Run the Database Migration

```bash
# Apply the migration to create the snippet_analytics table
psql $DATABASE_URL < scripts/add-snippet-analytics.sql
```

### 2. Deploy Backend Changes

```bash
npm install
npm run build
npm start
```

### 3. Update Frontend to Log Analytics

Integrate analytics logging into:
- Snippet view component (log `view` action)
- Copy button (log `copy` action)
- Share button (log `share` action)

### 4. Verify Analytics Collection

```bash
# Check if analytics table has data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM snippet_analytics;"
```

---

## Future Enhancements

- **Real-time Analytics**: WebSocket updates for live dashboard
- **User Segmentation**: Analytics by user type, region, device
- **Event Correlation**: Link related actions (e.g., view → copy)
- **Retention Policies**: Auto-archive old analytics data
- **Custom Events**: Support for additional event types
- **Attribution Tracking**: Track snippet creation to eventual uses
