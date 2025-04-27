/**
 * Splits a string into words using whitespace and non-word characters as boundaries.
 * Non-word characters in the whitelist are treated as part of words.
 */
export declare function tokenize(inputString: string, nonWordCharWhitelist?: string): string[];
