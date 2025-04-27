/**
 * Calculates the Levenshtein distance between source and target.
 *
 * The Levenshtein distance tells the minimum number of single-character changes
 * needed to transform one word into another.
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
