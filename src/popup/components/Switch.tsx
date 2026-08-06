import type { ComponentChildren } from "preact";

type SwitchProps = {
  checked: boolean;
  children: ComponentChildren;
  disabled?: boolean;
  id: string;
  onChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  children,
  disabled = false,
  id,
  onChange
}: SwitchProps) {
  return (
    <label class="switch-row" htmlFor={id}>
      <span class="switch-label">{children}</span>
      <input
        checked={checked}
        class="switch-input"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.currentTarget.checked)}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" class="switch-control">
        <span class="switch-thumb" />
      </span>
    </label>
  );
}
