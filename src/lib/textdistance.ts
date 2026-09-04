/**
 * Damerou–Levenshtein edit distance (with transpositions), capped for speed.
 * Returns `max + 1` when the true distance exceeds `max`.
 */
export function damerauLevenshtein(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return Math.min(b.length, max + 1);
  if (b.length === 0) return Math.min(a.length, max + 1);

  const prev2 = new Array<number>(b.length + 1);
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, prev2[j - 2] + 1);
      }
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
