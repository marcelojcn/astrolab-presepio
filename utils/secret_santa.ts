/**
 * Returns a new shuffled copy of the array (Fisher-Yates algorithm).
 * The original array is never mutated.
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates a derangement of `users` — a permutation in which no element
 * appears in its original position, guaranteeing no self-assignment.
 *
 * Uses a randomised retry loop. The probability of a valid derangement on
 * each attempt is ≈ 1/e (36.8 %), so 20 attempts succeed with probability
 * 1 − (1 − 1/e)^20 > 99.9999 %.
 *
 * Returns `null` only when a valid derangement is impossible (i.e. a list
 * of exactly one element) or if all 20 attempts fail (astronomically rare).
 */
export function createDerangement(users: string[]): string[] | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const shuffled = shuffle(users);
    if (shuffled.every((receiver, i) => receiver !== users[i])) {
      return shuffled;
    }
  }
  return null;
}
