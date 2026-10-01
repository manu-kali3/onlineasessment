/**
 * Horizontal scroll container for wide tables.
 *
 * The assessment tables run to six columns, which overflows a phone and pushes
 * the whole page sideways. This keeps the table intact and scrolls only that
 * region, with a focusable element so keyboard users can reach it — an
 * `overflow: auto` div that is not focusable is unreachable by keyboard.
 */
export function TableWrap({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /** Describes the table for screen readers, e.g. "Recent attempts". */
  label?: string;
}) {
  return (
    <div
      className={`table-wrap ${className}`}
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}