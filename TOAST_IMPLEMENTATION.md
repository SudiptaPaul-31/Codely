# 🍞 Toast Notification System - CodeCodely

## Overview

The CodeCodely platform now features a comprehensive **toast notification system** powered by [Sonner](https://sonner.emilkowal.ski/), providing real-time UX feedback for key actions including adding, editing, and deleting code snippets.

The system integrates seamlessly with the existing gradient-based design and offers:
- ✅ **Success & Error States** - Distinct styling for different notification types
- ⏱️ **Auto-dismiss** - Notifications automatically disappear after 5 seconds
- 🔔 **Manual Dismissal** - Users can close notifications manually
- ♿ **Accessibility** - Full ARIA role and screen reader support
- 🎨 **Consistent Design** - Matches the CodeCodely gradient theme with purple/blue accents
- 📍 **Fixed Position** - Appears in top-right corner for non-intrusive placement
- 🎭 **Multiple Variants** - Support for success, error, warning, and info states

## Architecture

### 1. **ToastProvider Component** (`components/ToastProvider.tsx`)
The root provider that initializes Sonner's Toaster with CodeCodely-specific configuration:

```typescript
<ToastProvider />
```

**Features:**
- Configured position: `top-right`
- Dark theme with custom colors matching the app's gradient
- Shows up to 3 toasts simultaneously
- Close button enabled for manual dismissal
- Auto-expands to fit content

### 2. **Custom useToast Hook** (`hooks/useToast.ts`)
A convenient wrapper around Sonner's toast API for consistent usage throughout the app.

```typescript
import { useToast } from '@/hooks/useToast';

const { success, error, warning, info, loading } = useToast();
```

### 3. **Global Styling** (`app/globals.css`)
Custom CSS that matches toast notifications to the CodeCodely design with:
- Dark background with purple/blue borders
- Gradient glow effects
- Smooth slide-in animations
- Type-specific color coding (green for success, red for error, etc.)

## Usage

### Basic Usage with Direct Import

```typescript
import { toast } from 'sonner';

// Success
toast.success('Snippet created successfully!');

// Error
toast.error('Failed to save snippet');

// Warning
toast.warning('This action cannot be undone');

// Info
toast.info('Your changes have been saved');
```

### Using the Custom Hook (Recommended)

```typescript
'use client';

import { useToast } from '@/hooks/useToast';

export function MyComponent() {
  const { success, error, loading, promise } = useToast();

  const handleAction = async () => {
    // Show loading toast
    const toastId = loading('Saving snippet...');

    try {
      const result = await saveSnippet();
      success('Snippet saved successfully!');
    } catch (err) {
      error('Failed to save snippet');
    }
  };

  return <button onClick={handleAction}>Save</button>;
}
```

### Promise-Based Toasts

```typescript
const { promise } = useToast();

const myPromise = api.createSnippet(data);

promise(myPromise, {
  loading: 'Creating snippet...',
  success: 'Snippet created successfully!',
  error: 'Failed to create snippet',
});
```

## Implementation Details

### SnippetForm Component Updates
The SnippetForm component (`components/SnippetForm.tsx`) now includes:
- ✅ Success toast when snippet is created
- ✅ Success toast when snippet is updated
- ❌ Error toast with descriptive messages on failure
- 🔐 Wallet connection validation toast

```typescript
try {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(errorData.error || 'Failed to save snippet');
  
  toast.success(editingId ? 'Snippet updated successfully!' : 'Snippet created successfully!');
  await fetchSnippets();
  closeForm();
} catch (error) {
  toast.error(error.message);
}
```

### Snippets Page Updates
The snippets page (`app/snippets/page.tsx`) now includes toasts for:

#### Save/Update Action
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  try {
    const res = await fetch(url, { method: editingId ? 'PUT' : 'POST' });
    if (!res.ok) throw new Error('Failed to save snippet');
    
    toast.success(editingId ? 'Snippet updated successfully!' : 'Snippet created successfully!');
    await fetchSnippets();
    handleCancel();
  } catch (error) {
    toast.error(error.message);
  }
};
```

#### Delete Action
```typescript
const handleDelete = async (id: string) => {
  if (!confirm('Delete this snippet?')) return;
  try {
    const res = await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete snippet');
    
    toast.success('Snippet deleted successfully!');
    await fetchSnippets();
  } catch (error) {
    toast.error(error.message);
  }
};
```

#### Copy to Clipboard Action
```typescript
const handleCopy = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  } catch (error) {
    toast.error('Failed to copy code to clipboard');
  }
};
```

## Toast Variants

### Success Toast
```typescript
toast.success('Action completed successfully!');
```
- **Color:** Green (#22c55e)
- **Icon:** Check mark
- **Duration:** 5 seconds (auto-dismiss)

### Error Toast
```typescript
toast.error('Something went wrong!');
```
- **Color:** Red (#ef4444)
- **Icon:** Error symbol
- **Duration:** 5 seconds (auto-dismiss)

### Warning Toast
```typescript
toast.warning('Are you sure?');
```
- **Color:** Amber (#ead305)
- **Icon:** Warning symbol
- **Duration:** 5 seconds (auto-dismiss)

### Info Toast
```typescript
toast.info('Information message');
```
- **Color:** Blue (#3b82f6)
- **Icon:** Info symbol
- **Duration:** 5 seconds (auto-dismiss)

### Loading Toast
```typescript
const toastId = toast.loading('Processing...');
// Later...
toast.dismiss(toastId);
```
- **Color:** Blue (#3b82f6)
- **Icon:** Spinner animation
- **Dismissible:** Manual only

## Accessibility

The toast system includes comprehensive accessibility features:

- **ARIA Roles:** Proper `role="status"` for live regions
- **Screen Reader Support:** Announcements for toast appearance and dismissal
- **Keyboard Navigation:** Users can dismiss toasts with keyboard
- **Color Independence:** Icons used alongside colors for color-blind users
- **Focus Management:** Proper focus handling when toasts appear/disappear

## Styling & Customization

### Toast Container
- **Position:** Fixed top-right (configurable in `ToastProvider`)
- **Max Visible:** 3 toasts at once
- **Auto-Dismiss:** 5 seconds (configurable per toast)
- **Theme:** Dark mode optimized

### Custom Styling Applied
```css
[data-sonner-toast] {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(168, 85, 247, 0.2);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
  animation: slide-in-right 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Customizing Toast Appearance
To modify toast styling globally, edit `app/globals.css` in the "Sonner Toast Styling" section.

## Configuration Options

### Per-Toast Options
```typescript
toast.success('Message', {
  duration: 4000,        // Custom duration in ms
  description: 'Details' // Additional description
  action: {
    label: 'Undo',
    onClick: () => { /* ... */ }
  }
});
```

### Global Configuration
Modify `components/ToastProvider.tsx` to adjust:
- Position (top-right, bottom-right, etc.)
- Theme (dark/light)
- Number of visible toasts
- Animation timing
- Colors

```typescript
<Toaster
  position="top-right"
  richColors
  closeButton
  theme="dark"
  expand
  visibleToasts={3}
  style={{ ... }}
/>
```

## Best Practices

### ✅ Do's
- Show toasts for critical user actions (save, delete, copy)
- Use appropriate toast types (success, error, warning, info)
- Keep messages concise and actionable
- Use loading toasts for long-running operations
- Test toast behavior across different screen sizes

### ❌ Don'ts
- Overuse toasts (can become annoying)
- Use vague error messages ("Something went wrong")
- Show toasts for every minor action
- Stack too many toasts at once
- Use only colors to indicate status (use icons too)

## Future Enhancements

The toast system is extensible and ready for:

1. **Wallet Integration Toasts**
   - Connection status
   - Transaction confirmations
   - Network switching notifications

2. **Advanced Features**
   - Undo/Redo actions in toasts
   - Rich HTML content in toasts
   - Toast history/log view
   - Toast analytics

3. **User Preferences**
   - Toast sound notifications (optional)
   - Toast position preferences
   - Auto-dismiss timeout customization

## Troubleshooting

### Toasts not appearing?
1. Ensure `ToastProvider` is in the layout's client tree
2. Check that `import { toast } from 'sonner'` is correct
3. Verify the component is marked with `'use client'`

### Styling issues?
1. Clear browser cache
2. Check that `app/globals.css` was updated with toast styles
3. Verify Tailwind CSS is properly configured

### Multiple toasts stacking?
1. Use `toast.dismiss()` to clear previous toasts
2. Adjust `visibleToasts` in `ToastProvider` (currently set to 3)
3. Consider using a toast queue system

## Related Files

- **Components:** `components/ToastProvider.tsx`
- **Hooks:** `hooks/useToast.ts`
- **Styling:** `app/globals.css` (search for "Sonner Toast Styling")
- **Implementation:** `components/SnippetForm.tsx`, `app/snippets/page.tsx`
- **Configuration:** `package.json` (sonner dependency)

## Dependencies

```json
{
  "sonner": "^1.7.4"
}
```

## Support

For issues or feature requests related to the toast system:
1. Check the [Sonner documentation](https://sonner.emilkowal.ski/)
2. Review the implementation files listed above
3. Test in browser DevTools to verify toast behavior
4. Report bugs with specific error messages and reproduction steps
