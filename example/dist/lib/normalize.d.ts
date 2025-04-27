declare const DEFAULT_OPTIONS: {
    caseSensitive: boolean;
    accentSensitive: boolean;
};
/**
 * Will create a normalized version of the input string based on options suitable for
 * further processing
 */
export declare function normalize(input: string, options?: Partial<typeof DEFAULT_OPTIONS>): string;
export {};
