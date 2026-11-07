import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const AnnounceContext = createContext<(message: string) => void>(() => {
  throw new Error('useAnnounce must be used inside LiveRegionProvider');
});

/** Returns a function that speaks a message to screen readers (polite). */
export function useAnnounce() {
  return useContext(AnnounceContext);
}

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const announce = useCallback((text: string) => {
    // Clear first so repeating the same text is announced again.
    setMessage('');
    setTimeout(() => setMessage(text), 50);
  }, []);
  const value = useMemo(() => announce, [announce]);
  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div
        data-testid="live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}
