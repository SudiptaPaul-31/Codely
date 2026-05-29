"use client";

import { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  enabled?: boolean;
  preventDefault?: boolean;
  onKeyDown: () => void;
}

function normalizeKey(key: string) {
  return key.toLowerCase();
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        !event.ctrlKey
      ) {
        return;
      }

      const key = normalizeKey(event.key);
      const shortcut = shortcutsRef.current.find(
        (item) => item.enabled !== false && normalizeKey(item.key) === key,
      );

      if (!shortcut) return;

      if (shortcut.preventDefault !== false) {
        event.preventDefault();
      }

      shortcut.onKeyDown();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
