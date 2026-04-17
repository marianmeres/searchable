/**
 * Letters that Unicode NFD does NOT decompose into a base + combining mark,
 * mapped to a plain-ASCII fold. Covers common European edge cases:
 * German `ß`, Scandinavian `ø/æ`, French `œ`, Icelandic `þ/ð`, Polish `ł`,
 * Croatian/Vietnamese `đ`, Turkish dotless `ı`, etc.
 */
const EXTRA_FOLDS: Record<string, string> = {
	"ß": "ss",
	"ẞ": "SS",
	"ø": "o",
	"Ø": "O",
	"æ": "ae",
	"Æ": "AE",
	"œ": "oe",
	"Œ": "OE",
	"đ": "d",
	"Đ": "D",
	"ð": "d",
	"Ð": "D",
	"ł": "l",
	"Ł": "L",
	"þ": "th",
	"Þ": "Th",
	"ħ": "h",
	"Ħ": "H",
	"ı": "i",
	"ĸ": "k",
	"ŋ": "n",
	"Ŋ": "N",
	"ſ": "s",
	"ŧ": "t",
	"Ŧ": "T",
};

const EXTRA_FOLDS_RE = new RegExp(
	`[${Object.keys(EXTRA_FOLDS).join("")}]`,
	"g"
);

/**
 * Removes diacritical marks (accents) from a string.
 *
 * Applies Unicode NFD decomposition + strips combining marks (`U+0300–U+036F`).
 * Then additionally folds a curated set of letters that NFD does not decompose
 * on its own — e.g. `ß → ss`, `ø → o`, `æ → ae`, `œ → oe`, `đ → d`, `ł → l`,
 * `þ → th`, `ı → i`.
 *
 * @param input - The string to remove accents from
 * @returns String with diacritics removed and precomposed letters folded
 *
 * @example
 * ```ts
 * import { unaccent } from '@marianmeres/searchable';
 *
 * unaccent("café");        // "cafe"
 * unaccent("São Paulo");   // "Sao Paulo"
 * unaccent("straße");      // "strasse"
 * unaccent("København");   // "Kobenhavn"
 * unaccent("łódź");        // "lodz"
 * ```
 */
export function unaccent(input: string): string {
	return input
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(EXTRA_FOLDS_RE, (c) => EXTRA_FOLDS[c] ?? c);
}
