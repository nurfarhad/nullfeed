import type { ComponentChildren } from "preact";

type SwitchProps = {
  checked: boolean;
  children: ComponentChildren;
  disabled?: boolean;
  icon?: ComponentChildren;
  id: string;
  onChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  children,
  disabled = false,
  icon,
  id,
  onChange
}: SwitchProps) {
  return (
    <label class="switch-row" htmlFor={id}>
      <span class="switch-label">
        {icon}
        <span class="switch-text">{children}</span>
      </span>
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
