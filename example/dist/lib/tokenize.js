/**
 * Splits a string into words using whitespace and non-word characters as boundaries.
 * Non-word characters in the whitelist are treated as part of words.
 */
export function tokenize(inputString, nonWordCharWhitelist = "") {
    if (typeof inputString !== "string") {
        return [];
    }
    if (typeof nonWordCharWhitelist !== "string") {
        nonWordCharWhitelist = "";
    }
    // Escape special regex characters in the whitelist
    const escapedWhitelist = nonWordCharWhitelist
        .split("")
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("");
    // Create a Unicode-aware regex:
    // \p{L} - any Unicode letter
    // \p{N} - any Unicode number/digit
    // \p{Pc} - connecting punctuation chars like underscore
    // Add the whitelist characters to what's considered part of a word
    const wordPattern = new RegExp(`[\\p{L}\\p{N}\\p{Pc}${escapedWhitelist}]+`, "gu");
    // Find all matches of the word pattern
    return Array.from(inputString.matchAll(wordPattern), (match) => match[0]);
}
