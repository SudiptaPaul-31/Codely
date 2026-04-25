'use client';

import { toast } from 'sonner';

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function useToast() {
  return {
    success: (message: string, options?: ToastOptions) =>
      toast.success(message, options),
    error: (message: string, options?: ToastOptions) =>
      toast.error(message, options),
    info: (message: string, options?: ToastOptions) =>
      toast.info(message, options),
    warning: (message: string, options?: ToastOptions) =>
      toast.warning(message, options),
    loading: (message: string) => toast.loading(message),
    promise: <T,>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string;
        error: string;
      }
    ) => toast.promise(promise, messages),
    dismiss: (toastId?: string | number) => toast.dismiss(toastId),
    custom: (message: string, options?: ToastOptions) =>
      toast.custom(message, options),
  };
}
