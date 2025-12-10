/**
 * Calculates the Levenshtein distance between two strings.
 *
 * The Levenshtein distance represents the minimum number of single-character edits
 * (insertions, deletions, or substitutions) needed to transform one string into another.
 * Uses dynamic programming with O(m × n) time complexity where m and n are string lengths.
 *
 * @param source - The source string
 * @param target - The target string to compare against
 * @returns The edit distance (non-negative integer)
 *
 * @example
 * ```ts
 * import { levenshteinDistance } from '@marianmeres/searchable';
 *
 * levenshteinDistance("cat", "hat");
 * // returns: 1 (one substitution: c → h)
 *
 * levenshteinDistance("hello", "helo");
 * // returns: 1 (one deletion)
 *
 * levenshteinDistance("restaurant", "resturant");
 * // returns: 2 (handles common typos)
 * ```
 */
export function levenshteinDistance(source: string, target: string): number {
	// Create a matrix of size (source.length + 1) x (target.length + 1)
	const matrix: number[][] = [];

	// Initialize the first row and column of the matrix
	for (let i = 0; i <= source.length; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= target.length; j++) {
		matrix[0][j] = j;
	}

	// Fill in the rest of the matrix
	for (let i = 1; i <= source.length; i++) {
		for (let j = 1; j <= target.length; j++) {
			// If the characters are the same, cost is 0, otherwise 1
			const cost = source[i - 1] === target[j - 1] ? 0 : 1;

			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // deletion
				matrix[i][j - 1] + 1, // insertion
				matrix[i - 1][j - 1] + cost // substitution
			);
		}
	}

	// The Levenshtein distance is the value in the bottom-right corner of the matrix
	return matrix[source.length][target.length];
}
