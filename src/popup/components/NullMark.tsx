type NullMarkProps = {
  size?: number;
};

export function NullMark({ size = 24 }: NullMarkProps) {
  return (
    <svg
      aria-hidden="true"
      class="null-mark"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M18.4 5.6a9 9 0 1 0 0 12.8" />
      <path d="M17.7 6.3 21 3" stroke="#2ed88a" />
    </svg>
  );
}
