/**
 * Uses Unicode normalization form "NFD" (Normalization Form Decomposition) which separates
 * characters with diacritical marks into their base character plus the combining diacritical
 * mark. And then removes (replaces with "") those diacritical marks.
 */
export function unaccent(input: string): string {
	return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
