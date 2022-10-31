const { bold, gray, red, yellow, magenta, cyan, green } = require('kleur/colors');
const prompt = require('prompt');
const fs = require('node:fs');
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const childProcess = require('node:child_process');

// args
const args = require('minimist')(process.argv.slice(2));
// console.log(args); process.exit();
const isYes = !!args.yes;
const isHelp = !!args.h || !!args.help;
let VERSION_NEW = `${args.v || ''}`.trim() || '1';
const VERSION_OLD = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

// return early with help?
if (isHelp) return help();

// auto increment version (if +1)
if (/^\+?1$/.test(VERSION_NEW)) {
	VERSION_NEW =
		'v' +
		VERSION_OLD.split('.')
			.map((v, idx) => {
				if (idx === 2) v = parseInt(v) + 1;
				return v;
			})
			.join('.');
}

// (auto) message
let MESSAGE = `Release ${VERSION_NEW}`;
if (args.m) MESSAGE = `${args.m} (${MESSAGE})`;

// run now
main().catch(onError);

//////////////////////////////////////////////////////////////////////////////////////////
async function main() {
	if (isYes) {
		await doJob();
	} else {
		prompt.start();
		const property = {
			name: 'yn',
			message: yellow(
				[
					`This will change version from "${VERSION_OLD}" to "${cyan(VERSION_NEW)}"...`,
					`\nAre you sure? [y/n]`,
				].join('')
			),
			validator: /^[yn]$/i,
			warning: 'You must respond with "y" or "n"',
			default: 'y',
		};
		prompt.get(property, async (err, result) => {
			if (err) return onError(err);
			if (result && result.yn && /y/i.test(result.yn)) {
				await doJob();
			}
		});
	}
}

// actual worker
async function doJob() {
	try {
		await version(VERSION_NEW);

		// syncujeme aj serverovsky package.json
		// process.chdir('../server');
		// await version(VERSION_NEW);
		// process.chdir('../client');

		// pokracujeme...
		await childProcess.spawnSync('git', ['add', 'package.json', 'package-lock.json'], { stdio: 'inherit' });
		await childProcess.spawnSync('git', ['commit', '-m', MESSAGE], { stdio: 'inherit' });
		await childProcess.spawnSync('git', ['tag', VERSION_NEW], { stdio: 'inherit' });
		// await childProcess.spawnSync('git', ['status'], { stdio: 'inherit' });

		console.log(
			green(
				`\n    ${VERSION_NEW} ${gray(`(you still need to manually push the release)`)}\n`
			)
		);
		process.exit(0);
	} catch (e) {
		onError(e);
	}
}

function onError(e) {
	console.log('\n' + red(e.toString().trim()) + '\n');
	process.exit(1);
}

function help() {
	console.log(`
    ${yellow('Usage:')}
        npm run release
        npm run release -- [-v +1|vX.Y.Z] [-m message] [--yes]

`);
	process.exit();
}

async function version(v) {
	const { stdout, stderr } = await exec(`npm version ${v} --no-git-tag-version`);
	if (stderr) throw stderr;
	return stdout;
}

async function branch() {
	const { stdout, stderr } = await exec(`git rev-parse --abbrev-ref HEAD`);
	if (stderr) throw stderr;
	return stdout;
}
