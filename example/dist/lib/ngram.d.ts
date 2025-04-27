/**
 * Generates n-grams from an input string optimized for fuzzy search applications.
 */
export declare function createNgrams(normalizedText: string, size?: number, options?: Partial<{
    padChar: string;
}>): string[];
