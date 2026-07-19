import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * input — tokenized text control. Evidence-bearing values (party IDs,
 * amounts, routes) take `mono` so they render in the testifying voice.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export function Input({ mono = false, className, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={["sv-input", className].filter(Boolean).join(" ")}
      data-mono={mono ? "true" : undefined}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export function Textarea({ mono = false, className, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      className={["sv-input", "sv-textarea", className]
        .filter(Boolean)
        .join(" ")}
      data-mono={mono ? "true" : undefined}
    />
  );
}
