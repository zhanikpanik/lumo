import { cn } from '@/lib/utils';

interface SvgIconProps {
  /** Raw SVG string (imported with ?raw) */
  raw: string;
  className?: string;
}

/** Renders an inline SVG with full currentColor support. Use with `import icon from './icon.svg?raw'` */
export function SvgIcon({ raw, className }: SvgIconProps) {
  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      dangerouslySetInnerHTML={{ __html: raw }}
      aria-hidden="true"
    />
  );
}
