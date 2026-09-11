/** Stable world-pixel grid; identical locations remain accessible in a popup list. */
export function clusterPoints<T>(points: { x: number; y: number; value: T }[], cellSize: number) {
  const cells = new Map<string, typeof points>();
  for (const point of points) {
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point); else cells.set(key, [point]);
  }
  return [...cells.values()];
}
