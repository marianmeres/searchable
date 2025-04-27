import { unaccent } from "./unaccent.ts";

const DEFAULT_OPTIONS: {
	caseSensitive: boolean;
	accentSensitive: boolean;
} = {
	caseSensitive: false,
	accentSensitive: false,
};

/**
 * Will create a normalized version of the input string based on options suitable for
 * further processing
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
