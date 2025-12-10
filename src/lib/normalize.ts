import { unaccent } from "./unaccent.ts";

const DEFAULT_OPTIONS: {
	caseSensitive: boolean;
	accentSensitive: boolean;
} = {
	caseSensitive: false,
	accentSensitive: false,
};

/**
 * Creates a normalized version of the input string based on options.
 *
 * Applies trimming, optional lowercasing, and optional accent removal
 * to prepare text for consistent indexing and searching.
 *
 * @param input - The string to normalize
 * @param options - Normalization options
 * @param options.caseSensitive - If false, converts to lowercase (default: false)
 * @param options.accentSensitive - If false, removes diacritical marks (default: false)
 * @returns Normalized string
 *
 * @example
 * ```ts
 * import { normalize } from '@marianmeres/searchable';
 *
 * normalize("  Café  ");
 * // returns: "cafe"
 *
 * normalize("Café", { caseSensitive: true });
 * // returns: "Cafe"
 *
 * normalize("Café", { accentSensitive: true });
 * // returns: "café"
 * ```
 */
export function normalize(
	input: string,
	options: Partial<typeof DEFAULT_OPTIONS> = {}
): string {
	input = `${input}`.trim();

	const { caseSensitive, accentSensitive } = {
		...DEFAULT_OPTIONS,
		...(options || {}),
	};

	if (!caseSensitive) {
		input = input.toLowerCase();
	}

	if (!accentSensitive) {
		input = unaccent(input);
	}

	return input;
}
