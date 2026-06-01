# Soft Delete Frontend Integration Guide

## Overview

This guide provides frontend implementation examples for integrating soft delete functionality into the Codely UI.

## Components to Build

### 1. Trash Section Component

#### Location
`components/TrashSection.tsx`

#### Implementation
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader } from '@/components/ui/loader';

interface DeletedSnippet {
  id: string;
  title: string;
  description: string;
  language: string;
  deleted_at: string;
  deleted_by: string;
  owner_wallet_address: string;
}

interface TrashResponse {
  data: DeletedSnippet[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function TrashSection() {
  const { wallet } = useWallet();
  const [trash, setTrash] = useState<DeletedSnippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  useEffect(() => {
    if (wallet) {
      fetchTrash();
    }
  }, [wallet]);

  const fetchTrash = async (offset = 0) => {
    if (!wallet) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/snippets/trash?limit=20&offset=${offset}`,
        {
          headers: {
            'x-wallet-address': wallet,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch trash');
      }

      const data: TrashResponse = await response.json();
      setTrash(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (snippetId: string) => {
    if (!wallet) return;

    try {
      const response = await fetch(
        `/api/snippets/${snippetId}/restore`,
        {
          method: 'POST',
          headers: {
            'x-wallet-address': wallet,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to restore snippet');
      }

      // Remove from trash
      setTrash(trash.filter(s => s.id !== snippetId));
      setPagination(prev => ({
        ...prev,
        total: prev.total - 1,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handlePreviousPage = () => {
    const newOffset = Math.max(0, pagination.offset - pagination.limit);
    fetchTrash(newOffset);
  };

  const handleNextPage = () => {
    if (pagination.hasMore) {
      fetchTrash(pagination.offset + pagination.limit);
    }
  };

  if (!wallet) {
    return (
      <Card className="p-6">
        <p className="text-center text-gray-500">
          Connect your wallet to view trash
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Trash</h2>
        <span className="text-sm text-gray-500">
          {pagination.total} deleted snippet{pagination.total !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-red-800">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader />
        </div>
      ) : trash.length === 0 ? (
        <Card className="p-6">
          <p className="text-center text-gray-500">
            Your trash is empty
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {trash.map(snippet => (
              <Card key={snippet.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold">{snippet.title}</h3>
                    <p className="text-sm text-gray-600">
                      {snippet.description}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {snippet.language}
                      </span>
                      <span className="text-xs text-gray-500">
                        Deleted {new Date(snippet.deleted_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRestore(snippet.id)}
                    variant="outline"
                    size="sm"
                  >
                    Restore
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={handlePreviousPage}
              disabled={pagination.offset === 0}
              variant="outline"
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <Button
              onClick={handleNextPage}
              disabled={!pagination.hasMore}
              variant="outline"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

### 2. Delete Confirmation Dialog

#### Location
`components/DeleteConfirmationDialog.tsx`

#### Implementation
```typescript
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippetTitle: string;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  snippetTitle,
  onConfirm,
  isLoading = false,
}: DeleteConfirmationDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setError(null);
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            Delete Snippet?
          </DialogTitle>
          <DialogDescription>
            This will move "{snippetTitle}" to trash. You can restore it from
            the trash section within 30 days.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
          <strong>Note:</strong> Deleted snippets will be permanently removed
          after 30 days.
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. Activity Timeline Component

#### Location
`components/ActivityTimeline.tsx`

#### Implementation
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/components/WalletConnect';
import { Card } from '@/components/ui/card';
import { Loader } from '@/components/ui/loader';
import { Trash2, RotateCcw, Plus, Edit } from 'lucide-react';

interface ActivityLog {
  id: string;
  action: 'DELETE' | 'RESTORE' | 'CREATE' | 'UPDATE';
  userWalletAddress: string | null;
  details: Record<string, any>;
  createdAt: string;
}

interface ActivityTimelineProps {
  snippetId: string;
}

const actionIcons = {
  DELETE: Trash2,
  RESTORE: RotateCcw,
  CREATE: Plus,
  UPDATE: Edit,
};

const actionColors = {
  DELETE: 'text-red-600 bg-red-50',
  RESTORE: 'text-green-600 bg-green-50',
  CREATE: 'text-blue-600 bg-blue-50',
  UPDATE: 'text-yellow-600 bg-yellow-50',
};

export function ActivityTimeline({ snippetId }: ActivityTimelineProps) {
  const { wallet } = useWallet();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wallet) {
      fetchActivity();
    }
  }, [wallet, snippetId]);

  const fetchActivity = async () => {
    if (!wallet) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/snippets/${snippetId}/activity?limit=50`,
        {
          headers: {
            'x-wallet-address': wallet,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch activity');
      }

      const data = await response.json();
      setActivities(data.activities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-red-50 border-red-200">
        <p className="text-red-800">{error}</p>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-center text-gray-500">No activity yet</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Activity History</h3>
      <div className="space-y-3">
        {activities.map((activity, index) => {
          const Icon = actionIcons[activity.action];
          const colorClass = actionColors[activity.action];

          return (
            <div key={activity.id} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className={`p-2 rounded-full ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {index < activities.length - 1 && (
                  <div className="w-0.5 h-12 bg-gray-200 mt-2" />
                )}
              </div>

              {/* Activity content */}
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {activity.action.charAt(0) + activity.action.slice(1).toLowerCase()}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {activity.userWalletAddress && (
                    <span className="text-xs text-gray-500 font-mono">
                      {activity.userWalletAddress.slice(0, 8)}...
                    </span>
                  )}
                </div>

                {/* Activity details */}
                {activity.details && Object.keys(activity.details).length > 0 && (
                  <div className="mt-2 text-sm text-gray-600 space-y-1">
                    {activity.details.title && (
                      <p>
                        <strong>Title:</strong> {activity.details.title}
                      </p>
                    )}
                    {activity.details.language && (
                      <p>
                        <strong>Language:</strong> {activity.details.language}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 4. Updated Snippet Card Component

#### Location
`components/SnippetCard.tsx` (Updated)

#### Key Changes
```typescript
'use client';

import { useState } from 'react';
import { useWallet } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { Trash2 } from 'lucide-react';

interface SnippetCardProps {
  id: string;
  title: string;
  description: string;
  language: string;
  onDelete?: () => void;
}

export function SnippetCard({
  id,
  title,
  description,
  language,
  onDelete,
}: SnippetCardProps) {
  const { wallet } = useWallet();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!wallet) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/snippets/${id}`, {
        method: 'DELETE',
        headers: {
          'x-wallet-address': wallet,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete snippet');
      }

      onDelete?.();
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded mt-2 inline-block">
              {language}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        snippetTitle={title}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </>
  );
}
```

## Navigation Updates

### Update Navbar Component

#### Location
`components/navbar.tsx`

#### Add Trash Link
```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex gap-6">
          <Link
            href="/snippets"
            className={pathname === '/snippets' ? 'font-bold' : ''}
          >
            Snippets
          </Link>
          <Link
            href="/snippets/trash"
            className={`flex items-center gap-2 ${
              pathname === '/snippets/trash' ? 'font-bold' : ''
            }`}
          >
            <Trash2 className="h-4 w-4" />
            Trash
          </Link>
        </div>
        {/* ... rest of navbar */}
      </div>
    </nav>
  );
}
```

## New Pages

### Trash Page

#### Location
`app/snippets/trash/page.tsx`

#### Implementation
```typescript
'use client';

import { TrashSection } from '@/components/TrashSection';

export default function TrashPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <TrashSection />
    </div>
  );
}
```

### Snippet Detail Page with Activity

#### Location
`app/snippets/[id]/page.tsx` (Updated)

#### Key Changes
```typescript
'use client';

import { ActivityTimeline } from '@/components/ActivityTimeline';

export default function SnippetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-3 gap-8">
        {/* Snippet content */}
        <div className="col-span-2">
          {/* ... existing snippet display ... */}
        </div>

        {/* Activity sidebar */}
        <div>
          <ActivityTimeline snippetId={params.id} />
        </div>
      </div>
    </div>
  );
}
```

## API Integration Utilities

### Create API Client Hook

#### Location
`lib/api-client.ts`

#### Implementation
```typescript
import { useWallet } from '@/components/WalletConnect';

export function useSnippetAPI() {
  const { wallet } = useWallet();

  const headers = {
    'Content-Type': 'application/json',
    ...(wallet && { 'x-wallet-address': wallet }),
  };

  return {
    async deleteSnippet(id: string) {
      const response = await fetch(`/api/snippets/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error('Failed to delete snippet');
      return response.json();
    },

    async restoreSnippet(id: string) {
      const response = await fetch(`/api/snippets/${id}/restore`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) throw new Error('Failed to restore snippet');
      return response.json();
    },

    async getTrash(limit = 20, offset = 0) {
      const response = await fetch(
        `/api/snippets/trash?limit=${limit}&offset=${offset}`,
        { headers }
      );
      if (!response.ok) throw new Error('Failed to fetch trash');
      return response.json();
    },

    async getActivity(snippetId: string, limit = 50) {
      const response = await fetch(
        `/api/snippets/${snippetId}/activity?limit=${limit}`,
        { headers }
      );
      if (!response.ok) throw new Error('Failed to fetch activity');
      return response.json();
    },
  };
}
```

## Styling Considerations

### Tailwind Classes for Soft Delete UI
```css
/* Delete confirmation dialog */
.delete-dialog-warning {
  @apply bg-yellow-50 border border-yellow-200 text-yellow-800;
}

/* Trash item */
.trash-item {
  @apply border-l-4 border-red-300 bg-red-50;
}

/* Activity timeline */
.activity-timeline {
  @apply relative pl-8;
}

.activity-dot {
  @apply absolute left-0 top-0 h-4 w-4 rounded-full;
}

.activity-line {
  @apply absolute left-1.5 top-4 w-0.5 h-12 bg-gray-200;
}
```

## Accessibility Considerations

### ARIA Labels
```typescript
// Delete button
<button
  aria-label="Delete snippet"
  onClick={handleDelete}
>
  <Trash2 className="h-4 w-4" />
</button>

// Restore button
<button
  aria-label={`Restore ${snippetTitle}`}
  onClick={handleRestore}
>
  Restore
</button>

// Trash link in navigation
<Link
  href="/snippets/trash"
  aria-current={pathname === '/snippets/trash' ? 'page' : undefined}
>
  Trash
</Link>
```

### Keyboard Navigation
- Tab through delete/restore buttons
- Enter to confirm actions
- Escape to close dialogs

## Mobile Responsiveness

### Responsive Trash View
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Trash items */}
</div>
```

### Mobile-Friendly Dialog
```typescript
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="w-full sm:max-w-md">
    {/* Dialog content */}
  </DialogContent>
</Dialog>
```

## Error Handling

### User-Friendly Error Messages
```typescript
const errorMessages: Record<string, string> = {
  'Snippet not found': 'This snippet no longer exists',
  'Snippet is not deleted': 'This snippet is not in trash',
  'Unauthorized': 'You do not have permission to perform this action',
  'Failed to delete snippet': 'Could not delete snippet. Please try again.',
  'Failed to restore snippet': 'Could not restore snippet. Please try again.',
};
```

## Performance Optimization

### Lazy Load Activity Timeline
```typescript
import dynamic from 'next/dynamic';

const ActivityTimeline = dynamic(
  () => import('@/components/ActivityTimeline').then(mod => mod.ActivityTimeline),
  { loading: () => <Loader /> }
);
```

### Pagination for Large Trash
```typescript
// Implement infinite scroll or pagination
const [page, setPage] = useState(0);
const [hasMore, setHasMore] = useState(true);

const loadMore = async () => {
  const newPage = page + 1;
  const data = await getTrash(20, newPage * 20);
  setHasMore(data.pagination.hasMore);
  setPage(newPage);
};
```
