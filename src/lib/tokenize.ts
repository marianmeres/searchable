/** Characters that need escaping when placed inside a regex character class. */
const CLASS_META = new Set(["\\", "]", "^"]);

function escapeForCharClass(c: string): string {
	return CLASS_META.has(c) ? "\\" + c : c;
}

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
	if (typeof inputString !== "string") return [];
	if (typeof nonWordCharWhitelist !== "string") nonWordCharWhitelist = "";

	// Dedupe + split to code-point chars; move '-' to the end so it's treated as
	// a literal inside the char class, not a range.
	const chars = [...new Set([...nonWordCharWhitelist])];
	const hyphenIdx = chars.indexOf("-");
	let tail = "";
	if (hyphenIdx !== -1) {
		chars.splice(hyphenIdx, 1);
		tail = "-";
	}
	const escaped = chars.map(escapeForCharClass).join("") + tail;

	// \p{L} - any Unicode letter
	// \p{N} - any Unicode number/digit
	// \p{Pc} - connecting punctuation (underscore etc.)
	const wordPattern = new RegExp(
		`[^\\p{L}\\p{N}\\p{Pc}${escaped}]+`,
		"gu"
	);

	return inputString.split(wordPattern).filter((word) => word.length > 0);
}
