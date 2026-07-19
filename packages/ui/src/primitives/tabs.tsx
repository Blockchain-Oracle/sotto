import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

/**
 * tabs — Radix Tabs in the Sotto skin: a hairline list with a lapis
 * barline under the active trigger.
 */
export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Accessible name for the tab list. */
  label?: string;
  className?: string;
}

export function Tabs({
  items,
  defaultValue,
  value,
  onValueChange,
  label,
  className,
}: TabsProps) {
  const initial = defaultValue ?? items[0]?.value;
  return (
    <RadixTabs.Root
      className={["sv-tabs", className].filter(Boolean).join(" ")}
      {...(value !== undefined
        ? { value }
        : initial !== undefined
          ? { defaultValue: initial }
          : {})}
      {...(onValueChange === undefined ? {} : { onValueChange })}
    >
      <RadixTabs.List className="sv-tabs-list" aria-label={label}>
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className="sv-tabs-trigger"
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          value={item.value}
          className="sv-tabs-content"
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
