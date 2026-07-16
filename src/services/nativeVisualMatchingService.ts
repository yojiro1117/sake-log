export function embeddingSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let square = 0;
  for (let index = 0; index < left.length; index += 1) square += (left[index] - right[index]) ** 2;
  return Math.max(0, 1 - Math.sqrt(square / left.length));
}
