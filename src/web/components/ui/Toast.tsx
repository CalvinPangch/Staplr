import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { cn } from '../../lib/cn';

interface ToastOptions {
  title: string;
  description?: string;
  tone?: 'success' | 'error' | 'info';
}
interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {
  throw new Error('useToast must be used inside ToastProvider');
});

export function useToast() {
  return useContext(ToastContext);
}

const tones = {
  success: 'border-success bg-success-soft',
  error: 'border-danger bg-danger-soft',
  info: 'border-edge bg-surface',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((options: ToastOptions) => {
    setItems((current) => [
      ...current,
      { ...options, id: Date.now() + Math.random() },
    ]);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" duration={8000}>
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            type={item.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open)
                setItems((current) => current.filter((i) => i.id !== item.id));
            }}
            className={cn(
              'rounded-lg border p-4 text-fg shadow-lg',
              tones[item.tone ?? 'info'],
            )}
          >
            <RadixToast.Title className="font-semibold">
              {item.title}
            </RadixToast.Title>
            {item.description && (
              <RadixToast.Description className="mt-1 text-sm">
                {item.description}
              </RadixToast.Description>
            )}
            <RadixToast.Close className="mt-2 min-h-11 rounded-lg border border-edge bg-bg px-3 text-sm">
              Dismiss
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport
          label="Notifications ({hotkey})"
          className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
