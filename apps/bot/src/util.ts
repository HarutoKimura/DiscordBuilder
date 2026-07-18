/** Code-point-safe truncation — never splits surrogate pairs (emoji), which
 * Discord rejects as invalid form bodies. */
export function truncateText(text: string, max: number): string {
  const points = [...text];
  return points.length <= max ? text : points.slice(0, Math.max(0, max - 1)).join('') + '…';
}
