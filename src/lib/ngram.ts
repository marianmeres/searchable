/**
 * Generates character n-grams from an input string.
 *
 * N-grams are contiguous sequences of n characters extracted from the input text.
 * They are useful for fuzzy search as they capture local character patterns,
 * making searches more tolerant to typos and partial matches.
 *
 * @param normalizedText - The input string (should be pre-normalized)
 * @param size - The size of each n-gram (default: 3)
 * @param options - Configuration options
 * @param options.padChar - Character used to pad boundaries. Empty string disables padding (default: " ")
 * @returns Array of n-gram strings
 *
 * @example
 * ```ts
 * import { createNgrams } from '@marianmeres/searchable';
 *
 * createNgrams("hello", 3);
 * // returns: ["  h", " he", "hel", "ell", "llo", "lo ", "o  "] (with default space padding)
 *
 * createNgrams("hello", 3, { padChar: "" });
 * // returns: ["hel", "ell", "llo"] (without padding)
 *
 * createNgrams("test", 4, { padChar: "" });
 * // returns: ["test"]
 * ```
 */
export function createNgrams(
	normalizedText: string,
	size: number = 3,
	options: Partial<{
		// if empty will skip padding altogether
		padChar: string;
	}> = {}
): string[] {
	// Validate input
	if (typeof normalizedText !== "string") {
		throw new TypeError("Input text must be a string");
	}

	if (normalizedText.length === 0) {
		return [];
	}

	// Default options focused on fuzzy search needs
	const { padChar = " " } = options || {};

	let paddedText = normalizedText;

	if (padChar.length === 1) {
		// Add padding characters equal to n-1 at both start and end
		// This ensures proper boundary representation
		const padString = padChar.repeat(size - 1);
		paddedText = padString + normalizedText + padString;
	}

	const chars = [...paddedText];

	// Early return for inputs smaller than n-gram size, even with padding
	if (chars.length < size) {
		return [];
	}

	const ngrams = [];
	// Generate n-grams with special weighting for boundary n-grams (important for search)
	for (let i = 0; i <= chars.length - size; i++) {
		const ngram = chars.slice(i, i + size).join("");
		ngrams.push(ngram);
	}

	return ngrams;
}
