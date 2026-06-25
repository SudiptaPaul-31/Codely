# Analytics Integration Quick Start

This guide helps you integrate snippet analytics tracking into your frontend components.

## Installation & Setup

### 1. Run Database Migration

```bash
# Apply the analytics schema to your database
psql $DATABASE_URL < scripts/add-snippet-analytics.sql
```

### 2. Verify the API is Running

The analytics endpoints are automatically available at:
- `POST /api/snippets/:id/analytics` - Log actions
- `GET /api/snippets/:id/analytics` - Fetch analytics
- `GET /api/analytics` - Global analytics

---

## Frontend Integration

### Logging View Analytics

Track when a user views/opens a snippet:

```typescript
// snippets/[id]/page.tsx
import { useEffect } from 'react';

export default function SnippetPage({ params }) {
  const { id } = params;

  useEffect(() => {
    // Log view when snippet loads
    logAnalytics(id, 'view');
  }, [id]);

  return (
    // Snippet content
  );
}

async function logAnalytics(snippetId: string, actionType: 'view' | 'copy' | 'share') {
  try {
    await fetch(`/api/snippets/${snippetId}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType,
        userWallet: getUserWallet() // Your auth logic
      })
    });
  } catch (error) {
    console.error('Analytics logging failed:', error);
    // Don't throw - don't interrupt user experience
  }
}
```

### Logging Copy Analytics

Track when a user copies snippet code:

```typescript
// components/SnippetCopyButton.tsx
import { Copy } from 'lucide-react';

export function CopyButton({ snippetId, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    
    // Log copy action
    await fetch(`/api/snippets/${snippetId}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'copy',
        metadata: { 
          format: 'text',
          codeLength: code.length 
        }
      })
    }).catch(console.error);

    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy}>
      <Copy size={16} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
```

### Logging Share Analytics

Track when a user shares a snippet:

```typescript
// components/SnippetShareButton.tsx
import { Share2 } from 'lucide-react';

export function ShareButton({ snippetId, title, userWallet }) {
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/snippets/${snippetId}`;
    
    // Log share action
    await fetch(`/api/snippets/${snippetId}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'share',
        userWallet: userWallet || null,
        metadata: {
          method: 'native',
          title: title
        }
      })
    }).catch(console.error);

    // Use native share if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Check out: ${title}`,
          url: shareUrl
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Share failed:', error);
        }
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      // Show "Link copied" toast
    }
  };

  return (
    <button onClick={handleShare}>
      <Share2 size={16} />
      Share
    </button>
  );
}
```

---

## Fetching Analytics Data

### Get Snippet-Specific Analytics

```typescript
// hooks/useSnippetAnalytics.ts
import { useEffect, useState } from 'react';

export function useSnippetAnalytics(snippetId: string) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/snippets/${snippetId}/analytics`)
      .then(r => r.json())
      .then(data => {
        setAnalytics(data.summary);
        setLoading(false);
      })
      .catch(console.error);
  }, [snippetId]);

  return { analytics, loading };
}

// Usage in component
function SnippetStats({ snippetId }) {
  const { analytics, loading } = useSnippetAnalytics(snippetId);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="analytics">
      <p>👁️ {analytics.views} views</p>
      <p>📋 {analytics.copies} copies</p>
      <p>🔗 {analytics.shares} shares</p>
    </div>
  );
}
```

### Get Global Analytics for Dashboard

```typescript
// components/AnalyticsDashboard.tsx
import { useEffect, useState } from 'react';

export function AnalyticsDashboard() {
  const [stats, setStats] = useState(null);
  const [topSnippets, setTopSnippets] = useState([]);

  useEffect(() => {
    // Fetch summary
    fetch('/api/analytics?type=summary')
      .then(r => r.json())
      .then(data => setStats(data.summary));

    // Fetch top viewed
    fetch('/api/analytics?type=top-viewed&limit=10')
      .then(r => r.json())
      .then(data => setTopSnippets(data.snippets));
  }, []);

  if (!stats) return <p>Loading...</p>;

  return (
    <div className="dashboard">
      <h2>Analytics Overview</h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Views</h3>
          <p className="stat-value">{stats.totalViews.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <h3>Total Copies</h3>
          <p className="stat-value">{stats.totalCopies.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <h3>Total Shares</h3>
          <p className="stat-value">{stats.totalShares.toLocaleString()}</p>
        </div>
      </div>

      <div className="top-snippets">
        <h3>Top 10 Most Viewed</h3>
        <ul>
          {topSnippets.map(snippet => (
            <li key={snippet.snippet_id}>
              <a href={`/snippets/${snippet.snippet_id}`}>
                {snippet.title || 'Untitled'}
              </a>
              <span>{snippet.view_count} views</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

---

## Best Practices

### 1. Error Handling

Always wrap analytics calls in try-catch and don't let them interrupt user experience:

```typescript
async function logAnalytics(snippetId, actionType) {
  try {
    const response = await fetch(`/api/snippets/${snippetId}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType })
    });

    if (!response.ok) {
      console.error('Analytics logging failed:', response.status);
      // Don't throw - silently fail
    }
  } catch (error) {
    console.error('Analytics error:', error);
    // Network failure - don't interrupt user
  }
}
```

### 2. Metadata Tracking

Include useful metadata with analytics events:

```typescript
// Good: Include contextual information
await fetch(`/api/snippets/${id}/analytics`, {
  method: 'POST',
  body: JSON.stringify({
    actionType: 'copy',
    metadata: {
      format: 'javascript',
      codeLength: 245,
      language: 'TypeScript'
    }
  })
});
```

### 3. Debounce Multiple Views

For single-page applications, avoid logging multiple views for the same snippet:

```typescript
// Use AbortController to prevent duplicate logs
const viewLogAbort = new AbortController();

useEffect(() => {
  viewLogAbort.abort(); // Cancel previous request
  
  const timer = setTimeout(() => {
    logAnalytics(snippetId, 'view');
  }, 500); // Debounce 500ms

  return () => clearTimeout(timer);
}, [snippetId]);
```

### 4. Track User Identity Consistently

Pass the user wallet when available for better analytics:

```typescript
import { useAuth } from '@/context/auth';

export function SnippetViewer({ snippetId }) {
  const { user } = useAuth();

  useEffect(() => {
    logAnalytics(snippetId, 'view', user?.walletAddress);
  }, [snippetId, user?.walletAddress]);
}

async function logAnalytics(
  snippetId: string,
  actionType: string,
  userWallet?: string
) {
  await fetch(`/api/snippets/${snippetId}/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType,
      userWallet: userWallet || null
    })
  }).catch(console.error);
}
```

### 5. Performance: Use Incremental Updates

For dashboards, update analytics data periodically but not constantly:

```typescript
function useDashboardAnalytics(refreshInterval = 30000) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = () => {
      fetch('/api/analytics?type=summary')
        .then(r => r.json())
        .then(data => setStats(data.summary));
    };

    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  return stats;
}
```

---

## Testing Analytics

### Test Logging

```typescript
it('should log view action', async () => {
  const snippetId = 'test-123';
  
  const response = await fetch(`/api/snippets/${snippetId}/analytics`, {
    method: 'POST',
    body: JSON.stringify({ actionType: 'view' })
  });

  expect(response.status).toBe(201);
  const data = await response.json();
  expect(data.event.action_type).toBe('view');
});
```

### Test Fetching Analytics

```typescript
it('should fetch snippet analytics', async () => {
  const snippetId = 'test-123';
  
  const response = await fetch(`/api/snippets/${snippetId}/analytics`);
  
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.summary.views).toBeGreaterThanOrEqual(0);
  expect(data.summary.copies).toBeGreaterThanOrEqual(0);
  expect(data.summary.shares).toBeGreaterThanOrEqual(0);
});
```

---

## Troubleshooting

### Analytics Not Recording

1. **Check database migration**: `SELECT COUNT(*) FROM snippet_analytics;`
2. **Check browser console**: Look for fetch errors
3. **Check server logs**: `grep "Analytics API" logs`
4. **Verify endpoint**: `curl -X POST http://localhost:3000/api/snippets/test/analytics -H "Content-Type: application/json" -d '{"actionType":"view"}'`

### Analytics API Slow

1. **Check database indexes**: `SELECT * FROM pg_indexes WHERE tablename = 'snippet_analytics';`
2. **Monitor queries**: `EXPLAIN ANALYZE SELECT ...` for slow queries
3. **Consider archiving**: Move old data to archive table
4. **Use read replicas**: For high-traffic analytics queries

### CORS Issues

If frontend and backend are on different domains, ensure CORS is configured:

```typescript
// next.config.mjs
headers: [
  {
    key: 'Access-Control-Allow-Origin',
    value: process.env.FRONTEND_URL || '*'
  }
]
```

---

## Performance Tips

1. **Batch Analytics Logs**: For bulk operations, consider queueing analytics
2. **Use Time-Series Data**: Query pre-aggregated daily/hourly summaries
3. **Archive Old Data**: Move events older than 1 year to separate tables
4. **Enable Database Compression**: Reduce storage for large analytics tables
5. **Monitor Query Performance**: Set up slow query logs

---

## Next Steps

- ✅ Integrate analytics logging into snippet view
- ✅ Integrate analytics logging into copy button
- ✅ Integrate analytics logging into share button
- ✅ Build analytics dashboard
- ✅ Set up monitoring/alerts
- Consider: Real-time analytics with WebSockets
- Consider: User segmentation and cohort analysis
