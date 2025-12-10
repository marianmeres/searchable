/**
 * Splits a string into words using whitespace and non-word characters as boundaries.
 *
 * Uses Unicode-aware word boundaries with support for letters (`\p{L}`), numbers (`\p{N}`),
 * and connecting punctuation (`\p{Pc}` like underscore). Characters in the whitelist
 * are treated as part of words rather than boundaries.
 *
 * @param inputString - The string to tokenize into words
 * @param nonWordCharWhitelist - Characters to include as part of words (default: "")
 * @returns Array of non-empty word tokens
 *
 * @example
 * ```ts
 * import { tokenize } from '@marianmeres/searchable';
 *
 * tokenize("Hello, World!");
 * // returns: ["Hello", "World"]
 *
 * tokenize("user@example.com", "@");
 * // returns: ["user@example.com"]
 *
 * tokenize("well-known", "-");
 * // returns: ["well-known"]
 * ```
 */
export function tokenize(
	inputString: string,
	nonWordCharWhitelist: string = ""
): string[] {
	if (typeof inputString !== "string") {
		return [];
	}
	if (typeof nonWordCharWhitelist !== "string") {
		nonWordCharWhitelist = "";
	}

	// save hyphen for later
	const hasHyphen = nonWordCharWhitelist.includes("-");
	nonWordCharWhitelist = nonWordCharWhitelist.replaceAll("-", "");

	let escapedWhitelist = nonWordCharWhitelist
		.split("")
		.map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("");

	if (hasHyphen) escapedWhitelist = `\\-` + escapedWhitelist;

	// \p{L} - any Unicode letter
	// \p{N} - any Unicode number/digit
	// \p{Pc} - connecting punctuation chars like underscore
	// Add the whitelist characters to what's considered part of a word
	const wordPattern = new RegExp(
		`[^\\p{L}\\p{N}\\p{Pc}${escapedWhitelist}]+`,
		"gu"
	);

	//
	return inputString.split(wordPattern).filter((word) => word.length > 0);
}
