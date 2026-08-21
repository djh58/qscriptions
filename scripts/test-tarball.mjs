import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_PACKAGE = "qscriptions";
const FORBIDDEN_DIGESTS = [
  "e9a9ce232eeee3657e87053edf27b0b1f5493c9111d9a37c41fc5cdb85a24247",
  "8ea6a2514e745bc4393f9a46cb37d207c2448c716e331143cb80ba14b0654333",
];

const tarball = process.argv[2];
assert.ok(tarball, "usage: npm run test:tarball -- /absolute/path/to/package.tgz");
assert.ok(isAbsolute(tarball), "tarball path must be absolute");
assert.match(basename(tarball), /^qscriptions-.*\.tgz$/u);

const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

assert.ok(entries.includes("package/package.json"));
assert.ok(entries.includes("package/LICENSE"));
assert.ok(entries.includes("package/README.md"));
assert.ok(entries.includes("package/dist/index.js"));
assert.ok(entries.includes("package/dist/index.d.ts"));

for (const entry of entries) {
  assert.match(entry, /^package\/(?:package\.json|LICENSE|README\.md|dist\/[^/]+\.(?:js|d\.ts))$/u);
  assert.doesNotMatch(entry, /(?:fixture|test|\.webp|\.map$)/iu);
}

const packageJson = JSON.parse(
  execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
);
assert.equal(packageJson.name, EXPECTED_PACKAGE);
assert.deepEqual(packageJson.dependencies ?? {}, {});
assert.equal(packageJson.type, "module");

const unpackedText = entries
  .filter((entry) => !entry.endsWith("/"))
  .map((entry) => execFileSync("tar", ["-xOzf", tarball, entry]))
  .map((buffer) => buffer.toString("latin1"))
  .join("\n");

assert.doesNotMatch(unpackedText, /RIFF....WEBP/su);
for (const digest of FORBIDDEN_DIGESTS) assert.ok(!unpackedText.includes(digest));

const consumer = await mkdtemp(join(tmpdir(), "qscriptions-consumer-"));
try {
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "qscriptions-clean-consumer", private: true, type: "module" }, null, 2)}\n`,
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarball],
    { cwd: consumer, stdio: "inherit" },
  );
  const installed = JSON.parse(await readFile(join(consumer, "node_modules", EXPECTED_PACKAGE, "package.json"), "utf8"));
  assert.equal(installed.name, EXPECTED_PACKAGE);
  const module = await import(pathToFileURL(join(consumer, "node_modules", EXPECTED_PACKAGE, "dist", "index.js")));
  assert.ok(Object.keys(module).length > 0, "packed module must expose at least one API symbol");
} finally {
  await rm(consumer, { recursive: true, force: true });
}

console.log(`verified ${tarball}: ${entries.length} allowlisted files, clean ESM consumer passed`);
