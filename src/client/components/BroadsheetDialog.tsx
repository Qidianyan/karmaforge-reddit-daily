import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface BroadsheetDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Accessible modal dialog built on native `<dialog closedby="any">` + `showModal()`,
 * including the mandatory light-dismiss click-outside fallback for Safari/older engines.
 */
export function BroadsheetDialog({ open, title, onClose, children }: BroadsheetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Mandatory fallback for browsers without native `<dialog closedby>` support.
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInside) {
        dialog.close();
      }
    };

    const supportsClosedBy =
      typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
    if (!supportsClosedBy) {
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (!supportsClosedBy) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="kf-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="kf-dialog-head">
        <h2 id={titleId} className="kf-dialog-title">
          {title}
        </h2>
        <button
          type="button"
          className="kf-dialog-close"
          aria-label={`Close ${title}`}
          onClick={() => dialogRef.current?.close()}
        >
          ×
        </button>
      </div>
      <div className="kf-dialog-body">{children}</div>
    </dialog>
  );
}
