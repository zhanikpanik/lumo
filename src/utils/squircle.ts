/**
 * Apple-style continuous corner (squircle) path generator.
 * 
 * Superellipse formula: |x|^n + |y|^n = 1
 * Parametric: x = |cos(t)|^(2/n) · sign(cos(t))
 *             y = |sin(t)|^(2/n) · sign(sin(t))
 * 
 * n=2 → circle, n≈5 → Apple squircle
 */

function superellipse(t: number, n: number): { x: number; y: number } {
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const pow = 2 / n;
  return {
    x: Math.pow(Math.abs(ct), pow) * Math.sign(ct),
    y: Math.pow(Math.abs(st), pow) * Math.sign(st),
  };
}

export function squirclePath(
  w: number,
  h: number,
  r: number,
  n: number = 5,
): string {
  if (r <= 0 || w <= 0 || h <= 0) return '';
  if (r * 2 > w) r = w / 2;
  if (r * 2 > h) r = h / 2;

  const steps = 64;

  // Sample one quadrant of the superellipse
  const q: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    const pt = superellipse(t, n);
    q.push(pt);
  }

  // Corners: top-right, bottom-right, bottom-left, top-left
  const corners = [
    { cx: w - r, cy: r,       sx: 1,  sy: -1 }, // TR
    { cx: w - r, cy: h - r,   sx: 1,  sy: 1  }, // BR
    { cx: r,     cy: h - r,   sx: -1, sy: 1  }, // BL
    { cx: r,     cy: r,       sx: -1, sy: -1 }, // TL
  ];

  const topEdge: { x: number; y: number }[] = [];
  const rightEdge: { x: number; y: number }[] = [];
  const bottomEdge: { x: number; y: number }[] = [];
  const leftEdge: { x: number; y: number }[] = [];

  for (let c = 0; c < 4; c++) {
    const { cx, cy, sx, sy } = corners[c];
    const pts = q.map(p => ({
      x: cx + sx * p.x * r,
      y: cy + sy * p.y * r,
    }));

    switch (c) {
      case 0: // TR: from top edge to right edge
        topEdge.push(...pts);      // goes right-to-left along top
        rightEdge.push(...[...pts].reverse()); // goes top-to-bottom along right
        break;
      case 1: // BR: from right edge to bottom edge
        // rightEdge already has TR reversed → no need to add
        bottomEdge.push(...[...pts].reverse()); // goes right-to-left along bottom
        break;
      case 2: // BL: from bottom edge to left edge
        leftEdge.push(...[...pts].reverse()); // goes bottom-to-top along left
        break;
      case 3: // TL: from left edge to top edge
        // closes the path
        break;
    }
  }

  // Build path: start at (r, 0), go clockwise
  // Top edge: from (r, 0) to (w-r, 0) → straight line
  // TR corner: from (w-r, 0) to (w, r) → superellipse with sx=1, sy=-1
  // Right edge: from (w, r) to (w, h-r) → straight
  // BR corner: from (w, h-r) to (w-r, h) → superellipse with sx=1, sy=1
  // Bottom edge: from (w-r, h) to (r, h) → straight
  // BL corner: from (r, h) to (0, h-r) → superellipse with sx=-1, sy=1
  // Left edge: from (0, h-r) to (0, r) → straight
  // TL corner: from (0, r) to (r, 0) → superellipse with sx=-1, sy=-1

  const fmt = (v: number) => v.toFixed(3);

  // TR corner points: x = (w-r) + sx * p.x * r where sx=1 → x = w - r + p.x * r
  //                                    y = r + sy * p.y * r where sy=-1 → y = r - p.y * r
  // The points go from (w-r, r) to (w, 0) in superellipse space, mapped to screen space
  // At t=0: superellipse(0,n) = (1, 0) → screen: (w-r + 1*r, r - 0*r) = (w, r)
  // At t=π/2: superellipse(π/2,n) = (0, 1) → screen: (w-r + 0*r, r - 1*r) = (w-r, 0)
  // The superellipse goes from x=1,y=0 to x=0,y=1 (top-right corner of unit superellipse)
  // On screen: from (w, r) to (w-r, 0)
  // But we want the path to go clockwise, so we go from (w-r, 0) → (w, r)
  // That's REVERSE order for TR

  const trCorner = q.map(p => ({
    x: (w - r) + 1 * p.x * r,
    y: r + (-1) * p.y * r,
  })).reverse(); // reversed = from (w-r,0) to (w,r)

  const brCorner = q.map(p => ({
    x: (w - r) + 1 * p.x * r,
    y: (h - r) + 1 * p.y * r,
  })); // from (w,h-r) to (w-r,h)

  const blCorner = q.map(p => ({
    x: r + (-1) * p.x * r,
    y: (h - r) + 1 * p.y * r,
  })).reverse(); // reversed = from (r,h) to (0,h-r)

  const tlCorner = q.map(p => ({
    x: r + (-1) * p.x * r,
    y: r + (-1) * p.y * r,
  })); // from (0,r) to (r,0)

  let d = '';

  // Start at top-left after corner: (r, 0)
  d += `M ${fmt(tlCorner[tlCorner.length - 1].x)} ${fmt(tlCorner[tlCorner.length - 1].y)} `;

  // Top edge: straight line to top-right corner start
  d += `L ${fmt(trCorner[0].x)} ${fmt(trCorner[0].y)} `;

  // TR corner
  for (let i = 1; i < trCorner.length; i++) {
    d += `L ${fmt(trCorner[i].x)} ${fmt(trCorner[i].y)} `;
  }

  // Right edge
  d += `L ${fmt(brCorner[0].x)} ${fmt(brCorner[0].y)} `;

  // BR corner
  for (let i = 1; i < brCorner.length; i++) {
    d += `L ${fmt(brCorner[i].x)} ${fmt(brCorner[i].y)} `;
  }

  // Bottom edge
  d += `L ${fmt(blCorner[0].x)} ${fmt(blCorner[0].y)} `;

  // BL corner
  for (let i = 1; i < blCorner.length; i++) {
    d += `L ${fmt(blCorner[i].x)} ${fmt(blCorner[i].y)} `;
  }

  // Left edge
  d += `L ${fmt(tlCorner[0].x)} ${fmt(tlCorner[0].y)} `;

  // TL corner
  for (let i = 1; i < tlCorner.length; i++) {
    d += `L ${fmt(tlCorner[i].x)} ${fmt(tlCorner[i].y)} `;
  }

  d += 'Z';
  return d;
}
