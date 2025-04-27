import { unaccent } from "./unaccent.js";
const DEFAULT_OPTIONS = {
    caseSensitive: false,
    accentSensitive: false,
};
/**
 * Will create a normalized version of the input string based on options suitable for
 * further processing
 */
export function normalize(input, options = {}) {
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
