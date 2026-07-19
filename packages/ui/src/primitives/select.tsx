import * as RadixSelect from "@radix-ui/react-select";

/**
 * select — Radix Select wrapped in the Sotto skin. The trigger matches
 * Input geometry; the item indicator is a lapis dot (the marking motif),
 * never a checkmark glyph pile.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** id wired to a Field label. */
  id?: string;
  disabled?: boolean;
  className?: string;
}

function Chevron() {
  return (
    <svg viewBox="0 0 10 6" width={10} height={6} aria-hidden="true">
      <path
        d="M 1 1 L 5 5 L 9 1"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  id,
  disabled,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root
      {...(value === undefined ? {} : { value })}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(disabled === undefined ? {} : { disabled })}
    >
      <RadixSelect.Trigger
        id={id}
        className={["sv-input", "sv-select-trigger", className]
          .filter(Boolean)
          .join(" ")}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="sv-select-icon">
          <Chevron />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="sv-select-content" position="popper">
          <RadixSelect.Viewport className="sv-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                {...(option.disabled === undefined
                  ? {}
                  : { disabled: option.disabled })}
                className="sv-select-item"
              >
                <RadixSelect.ItemIndicator className="sv-select-indicator" />
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
