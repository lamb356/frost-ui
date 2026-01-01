'use client';

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  description: string;
  handler: () => void;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are enabled (default: true) */
  enabled?: boolean;
  /** Shortcuts to register */
  shortcuts: KeyboardShortcut[];
}

/**
 * Hook for registering keyboard shortcuts.
 */
export function useKeyboardShortcuts({
  enabled = true,
  shortcuts,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Still allow Escape in inputs
        if (event.key !== 'Escape') {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const modifiers = shortcut.modifiers ?? {};

        const ctrlMatch = modifiers.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = modifiers.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = modifiers.alt ? event.altKey : !event.altKey;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch
        ) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    },
    [enabled, shortcuts]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Hook for common global shortcuts (Escape to close modals, etc.)
 */
export function useGlobalShortcuts(callbacks: {
  onEscape?: () => void;
  onEnter?: () => void;
}) {
  const shortcuts: KeyboardShortcut[] = [];

  if (callbacks.onEscape) {
    shortcuts.push({
      key: 'Escape',
      description: 'Close/Cancel',
      handler: callbacks.onEscape,
    });
  }

  if (callbacks.onEnter) {
    shortcuts.push({
      key: 'Enter',
      description: 'Confirm',
      handler: callbacks.onEnter,
    });
  }

  useKeyboardShortcuts({ shortcuts });
}
