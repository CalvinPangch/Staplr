import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

const overlay = 'fixed inset-0 z-40 bg-black/50';
export const dialogContent =
  'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-edge-soft bg-bg p-6 text-fg shadow-xl';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlay} />
        <RadixDialog.Content
          className={dialogContent}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <RadixDialog.Title className="text-lg font-semibold">
            {title}
          </RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mt-1 text-muted">
              {description}
            </RadixDialog.Description>
          )}
          <div className="mt-4 flex flex-col gap-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
