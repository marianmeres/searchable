// deno-lint-ignore-file no-explicit-any

import { ensureDir, emptyDir, copySync, walkSync } from "@std/fs";
import { join } from "@std/path";
import denoJson from "../deno.json" with { type: "json" };

/**
 * This is quick-n-dirty npm package build script...
 */

const TS_TO_JS_REGEX =
	/from\s+(['"])([^'"]+)\.ts(['"]);?|import\s*\(\s*(['"])([^'"]+)\.ts(['"]),?\s*\)/g;

// prettier-ignore
function replaceWithJs(_match: any, q1: any, path1: any, q3: any, q4: any, path2: any, q6: any) {
	if (path1) {
		// Static import: from "path.ts"
		return `from ${q1}${path1}.js${q3}`;
	} else {
		// Dynamic import: import("path.ts")
		return `import(${q4}${path2}.js${q6})`;
	}
}

const srcDir = "./src";
const outDir = "./.npm-dist";
const outDirSrc = join(outDir, srcDir);
const outDirDist = join(outDir, 'dist');

await ensureDir(outDir);
await emptyDir(outDir);

copySync(srcDir, outDirSrc);

// Deno.copyFileSync(join(srcDir, "mod.ts"), join(outDir, "index.ts"));
// Deno.renameSync(join(outDirSrc, "mod.ts"), join(outDirSrc, "index.ts"));

// copy
Deno.copyFileSync("LICENSE", join(outDir, "LICENSE"));
Deno.copyFileSync("README.md", join(outDir, "README.md"));

// create tsconfig.json
const tsconfigJson = {
	compilerOptions: {
		target: "esnext",
		module: "esnext",
		strict: false,
		declaration: true,
		forceConsistentCasingInFileNames: true,
		skipLibCheck: true,
		rootDir: "src",
		// allowImportingTsExtensions: true,
		// emitDeclarationOnly: true,
		// noEmit: true,
		outDir: "dist",
	},
};
Deno.writeTextFileSync(
	join(outDir, "tsconfig.json"),
	JSON.stringify(tsconfigJson, null, "\t")
);

// WTF: Option 'allowImportingTsExtensions' can only be used when...
// console.log(Array.from(walkSync(outDirSrc)));
for (const f of walkSync(outDirSrc)) {
	if (f.isFile) {
		const contents = Deno.readTextFileSync(f.path);
		const replaced = contents.replace(TS_TO_JS_REGEX, replaceWithJs);
		Deno.writeTextFileSync(f.path, replaced);
	}
}
// throw new Error('hoho')

// compile tsc
const command = new Deno.Command("tsc", {
	args: ["-p", join(outDir, "tsconfig.json")],
});
let { code, stdout, stderr } = command.outputSync();
stdout = new TextDecoder().decode(stdout) as any;
stdout && console.log(stdout);
if (code) throw new Error(new TextDecoder().decode(stderr));

// create package json
const packageJson = {
	name: denoJson.name,
	version: denoJson.version,
	type: "module",
	main: "dist/mod.js",
	types: "dist/mod.d.ts",
	author: "Marian Meres",
	license: "MIT",
	repository: {
		type: "git",
		url: "git+https://github.com/marianmeres/searchable.git",
	},
	bugs: {
		url: "https://github.com/marianmeres/searchable/issues",
	},
};
Deno.writeTextFileSync(
	join(outDir, "package.json"),
	JSON.stringify(packageJson, null, "\t")
);

// cleanup
['tsconfig.json'].forEach((f) => {
	Deno.removeSync(join(outDir, f))
});

Deno.removeSync(outDirSrc, { recursive: true });

// copy dist to example
copySync(outDirDist, 'example/dist', { overwrite: true });
