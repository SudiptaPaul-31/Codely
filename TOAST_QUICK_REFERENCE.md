# 🍞 Toast System - Quick Reference Guide

## Quick Start

### 1. Import and Use (Simplest)
```typescript
import { toast } from 'sonner';

toast.success('Success message!');
toast.error('Error message!');
```

### 2. Using the Custom Hook (Recommended)
```typescript
import { useToast } from '@/hooks/useToast';

const { success, error, warning, info, loading } = useToast();

success('All done!');
```

## Common Patterns

### Save/Update Action
```typescript
try {
  const res = await fetch('/api/endpoint', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!res.ok) throw new Error('Failed to save');
  
  toast.success('Saved successfully!');
} catch (error) {
  toast.error(error.message);
}
```

### Delete with Confirmation
```typescript
const handleDelete = async (id: string) => {
  if (!confirm('Are you sure?')) return;
  
  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    
    toast.success('Deleted successfully!');
    // Refresh data
  } catch (error) {
    toast.error(error.message);
  }
};
```

### Copy to Clipboard
```typescript
const handleCopy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  } catch {
    toast.error('Failed to copy');
  }
};
```

### Loading State
```typescript
const toastId = toast.loading('Processing...');

try {
  const result = await longOperation();
  toast.dismiss(toastId);
  toast.success('Complete!');
} catch (error) {
  toast.dismiss(toastId);
  toast.error('Failed!');
}
```

## All Toast Types

| Type | Usage | Color |
|------|-------|-------|
| Success | `toast.success()` | Green (#22c55e) |
| Error | `toast.error()` | Red (#ef4444) |
| Warning | `toast.warning()` | Amber (#ead305) |
| Info | `toast.info()` | Blue (#3b82f6) |
| Loading | `toast.loading()` | Blue spinner |

## Advanced Options

```typescript
toast.success('Message', {
  duration: 4000,                    // Duration in ms
  description: 'Optional details',   // Additional text
  action: {
    label: 'Undo',
    onClick: () => console.log('Undo clicked')
  }
});
```

## File Structure

```
components/
  └── ToastProvider.tsx          ← Root provider (in layout)

hooks/
  └── useToast.ts              ← Custom hook

app/
  ├── globals.css              ← Toast styling
  ├── layout.tsx               ← ToastProvider imported here
  └── snippets/page.tsx        ← Example implementation

TOAST_IMPLEMENTATION.md        ← Full documentation
```

## Checklist: Adding Toasts to New Features

- [ ] Import `toast` from 'sonner' or use `useToast` hook
- [ ] Add success toast on successful operation
- [ ] Add error toast with descriptive message
- [ ] Wrap operations in try-catch
- [ ] Test toast appears and auto-dismisses
- [ ] Test error messages are clear
- [ ] Test on mobile/tablet screens
- [ ] Verify accessibility with screen reader

## Currently Implemented In

✅ **SnippetForm Component** - Create/Update toasts
✅ **Snippets Page** - Create/Update/Delete/Copy toasts
✅ **Global Layout** - Toast provider available everywhere

## Need Help?

1. Check `TOAST_IMPLEMENTATION.md` for full docs
2. Look at `components/SnippetForm.tsx` for examples
3. Check `app/snippets/page.tsx` for more examples
4. Review `components/ToastProvider.tsx` for config
