'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme="dark"
      expand
      visibleToasts={3}
      style={{
        '--sonner-color-success': 'rgb(34, 197, 94)',
        '--sonner-color-error': 'rgb(239, 68, 68)',
        '--sonner-color-warning': 'rgb(234, 179, 8)',
        '--sonner-color-info': 'rgb(59, 130, 246)',
        '--sonner-color-background': 'rgba(15, 23, 42, 0.95)',
        '--sonner-color-border': 'rgba(168, 85, 247, 0.2)',
        '--sonner-text-color': 'rgb(255, 255, 255)',
      } as React.CSSProperties}
    />
  );
}
