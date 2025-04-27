/**
 * Generates n-grams from an input string optimized for fuzzy search applications.
 */
export function createNgrams(normalizedText, size = 3, options = {}) {
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
