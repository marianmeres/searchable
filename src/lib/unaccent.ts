/**
 * Removes diacritical marks (accents) from a string.
 *
 * Uses Unicode normalization form "NFD" (Normalization Form Decomposition) which separates
 * characters with diacritical marks into their base character plus the combining diacritical
 * mark, then removes those diacritical marks.
 *
 * @param input - The string to remove accents from
 * @returns String with all diacritical marks removed
 *
 * @example
 * ```ts
 * import { unaccent } from '@marianmeres/searchable';
 *
 * unaccent("café");
 * // returns: "cafe"
 *
 * unaccent("São Paulo");
 * // returns: "Sao Paulo"
 *
 * unaccent("crème brûlée");
 * // returns: "creme brulee"
 * ```
 */
export function unaccent(input: string): string {
	return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
