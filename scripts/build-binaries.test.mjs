import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(await readFile(new URL("../packages/coding-agent/package.json", import.meta.url), "utf8"));
const releaseScript = await readFile(new URL("./build-binaries.sh", import.meta.url), "utf8");
const jitiStatic = fileURLToPath(import.meta.resolve("jiti/static"));
const commands = [
	["local", manifest.scripts["build:binary"]],
	...Array.from(releaseScript.matchAll(/bun build --compile[^\n]+/g), (match, index) => [
		`release ${index + 1}`,
		match[0],
	]),
];

for (const [name, command] of commands) {
	// Compiled Bun can fail native package metadata resolution. See oven-sh/bun#27058.
	test(`${name} binary loads extension dependencies without global metadata autoload`, async (t) => {
		// Arrange
		const directory = await mkdtemp(join(tmpdir(), "pi-binary-extension-"));
		t.after(() => rm(directory, { recursive: true, force: true }));
		// Non-index entries prevent fallback resolution from masking the defect.
		const dependencies = [
			["legacy-fixture", 'module.exports = "outer dependency";'],
			["@scope/legacy-fixture", 'module.exports = "scoped dependency";'],
			["path", 'module.exports = "userland dependency";'],
			["nested-parent", 'module.exports = require("legacy-fixture");'],
			["nested-parent/node_modules/legacy-fixture", 'module.exports = "nested dependency";'],
			["native-only-fixture", 'module.exports = "native dependency";'],
		];
		for (const [path, source] of dependencies) {
			const dependency = join(directory, "node_modules", path);
			await mkdir(dependency, { recursive: true });
			await writeFile(join(dependency, "package.json"), JSON.stringify({ main: "runtime.cjs" }));
			await writeFile(join(dependency, "runtime.cjs"), source);
		}
		const restricted = join(directory, "node_modules", "restricted-fixture");
		await mkdir(restricted, { recursive: true });
		await writeFile(
			join(restricted, "package.json"),
			JSON.stringify({ main: "runtime.cjs", exports: { ".": "./runtime.cjs" } }),
		);
		await writeFile(join(restricted, "runtime.cjs"), 'module.exports = "restricted dependency";');
		const entry = join(directory, "extension.cjs");
		await writeFile(entry, `
module.exports = [
  require("legacy-fixture"),
  require("@scope/legacy-fixture"),
  require("path/runtime.cjs"),
  require("nested-parent")
];
`);
		const source = join(directory, "probe.mjs");
		await writeFile(source, `
import { createJiti } from ${JSON.stringify(jitiStatic)};
import { createRequire } from "node:module";
const entry = process.env.PI_EXTENSION_ENTRY;
if (!entry) throw new Error("PI_EXTENSION_ENTRY is required");
const jiti = createJiti(entry, { tryNative: false, fsCache: false, moduleCache: false });
let globalMetadataResolution = false;
try {
  createRequire(entry).resolve("native-only-fixture");
  globalMetadataResolution = true;
} catch {}
let restrictedDirectoryRejected = false;
try {
  jiti("restricted-fixture/");
} catch {
  restrictedDirectoryRejected = true;
}
console.log(JSON.stringify({ values: jiti(entry), globalMetadataResolution, restrictedDirectoryRejected }));
`);
		const binary = join(directory, process.platform === "win32" ? "probe.exe" : "probe");
		const flags = command.match(/--(?:no-)?compile-autoload-[\w-]+/g) ?? [];
		const build = spawnSync("bun", ["build", "--compile", ...flags, source, "--outfile", binary], {
			encoding: "utf8",
			timeout: 30_000,
		});
		assert.equal(build.status, 0, build.stderr || String(build.error));

		// Act
		const result = spawnSync(binary, [], {
			encoding: "utf8",
			timeout: 10_000,
			env: { ...process.env, PI_EXTENSION_ENTRY: entry },
		});

		// Assert
		assert.equal(result.status, 0, result.stderr || String(result.error));
		assert.deepEqual(JSON.parse(result.stdout), {
			values: ["outer dependency", "scoped dependency", "userland dependency", "nested dependency"],
			globalMetadataResolution: false,
			restrictedDirectoryRejected: true,
		});
		assert.ok(flags.includes("--no-compile-autoload-package-json"));
		assert.ok(!flags.includes("--compile-autoload-package-json"));
	});
}
