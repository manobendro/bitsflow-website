/** Small inline spinner (inherits the current text colour). Decorative. */
export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:[animation-duration:1.6s] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
