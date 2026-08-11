const CELL_SIZE = 36;

interface ZoneBlockProps {
 name: string;
 rows: number;
 cols: number;
}

export function ZoneBlock({ name, rows, cols }: ZoneBlockProps) {
 return (
  <div
   className="absolute flex items-center justify-center pointer-events-none select-none text-muted-foreground font-medium text-sm opacity-20"
   style={{
    left: 0,
    top: 0,
    width: cols * CELL_SIZE,
    height: rows * CELL_SIZE,
   }}
  >
   {name}
  </div>
 );
}
