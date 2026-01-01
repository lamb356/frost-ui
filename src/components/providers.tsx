'use client';

import { useState, useEffect } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { ShortcutsHelpModal } from '@/components/ui/modal';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { useFrostStore } from '@/lib/store';
import type { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

function GlobalShortcuts() {
  const [showShortcuts, setShowShortcuts] = useState(false);

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: '?',
        description: 'Show keyboard shortcuts',
        handler: () => setShowShortcuts(true),
      },
    ],
  });

  return (
    <ShortcutsHelpModal
      isOpen={showShortcuts}
      onClose={() => setShowShortcuts(false)}
    />
  );
}

function StoreHydration() {
  // Manually trigger hydration on mount since we use skipHydration
  useEffect(() => {
    useFrostStore.persist.rehydrate();
  }, []);

  return null;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ToastProvider>
      <StoreHydration />
      {children}
      <GlobalShortcuts />
    </ToastProvider>
  );
}
