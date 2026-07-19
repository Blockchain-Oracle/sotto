import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/**
 * dialog — Radix Dialog in the Sotto skin. Fits a 390px viewport with
 * internal scroll (DESIGN.md §7). Gate moments may set `voice="display"`
 * to title in Fraunces; product chrome stays in the working voice.
 */
export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens the dialog. */
  trigger?: ReactNode;
  title: string;
  description?: string;
  voice?: "working" | "display";
  children?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  voice = "working",
  children,
}: DialogProps) {
  return (
    <RadixDialog.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger === undefined ? null : (
        <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      )}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="sv-dialog-overlay" />
        <RadixDialog.Content className="sv-dialog">
          <RadixDialog.Title className="sv-dialog-title" data-voice={voice}>
            {title}
          </RadixDialog.Title>
          {description === undefined ? null : (
            <RadixDialog.Description className="sv-dialog-description">
              {description}
            </RadixDialog.Description>
          )}
          {children}
          <RadixDialog.Close className="sv-dialog-close" aria-label="Close">
            <svg viewBox="0 0 10 10" width={10} height={10} aria-hidden="true">
              <path
                d="M 1 1 L 9 9 M 9 1 L 1 9"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            </svg>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
