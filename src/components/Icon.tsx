import { cn } from "@/lib/utils";

/**
 * Material Symbols glyph, referenced by ligature name (the design's icon set).
 * The font is loaded once in the root layout; `.msym` carries the variation
 * settings. `aria-hidden` by default — icons here always sit beside a label.
 */
export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span className={cn("msym select-none", className)} aria-hidden>
      {name}
    </span>
  );
}
