import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_PACKAGE = "qscriptions";
const SCRIPT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FORBIDDEN_DIGESTS = [
  "852748890119300166f0c3050da3fee5c55316d199bcff1425424c009d2e62b9",
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
assert.equal(packageJson.type, "module");
for (const field of [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies",
  "bundleDependencies",
]) {
  const declaration = packageJson[field];
  assert.ok(
    declaration === undefined ||
      (Array.isArray(declaration)
        ? declaration.length === 0
        : typeof declaration === "object" &&
          declaration !== null &&
          Object.keys(declaration).length === 0),
    `${field} must be absent or empty`,
  );
}

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
  await writeFile(
    join(consumer, "consumer.mjs"),
    `import assert from "node:assert/strict";\n` +
      `import * as qscriptions from "qscriptions";\n` +
      `assert.deepEqual(Object.keys(qscriptions).sort(), ["QPET_LIMITS", "QPET_VERSION", "decodeQpetEnvelope", "decodeQpetOpReturn", "extractQpetEnvelope"]);\n` +
      `const sheet = new TextEncoder().encode("RIFF\\0\\0\\0\\0WEBPclean-consumer");\n` +
      `const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", sheet));\n` +
      `const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");\n` +
      `const manifest = { format: "codex-pet-v1", id: "consumer-pet", displayName: "Consumer Pet", description: "Constructed outside the package.", kind: "object", author: "clean-consumer", frame: { width: 1, height: 1, columns: 1, rows: 1 }, states: [{ id: "idle", row: 0, frames: 1, fps: 1, loop: true }], sheet: { contentType: "image/webp", length: sheet.byteLength, sha256 } };\n` +
      `const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));\n` +
      `const envelope = new Uint8Array(7 + manifestBytes.byteLength + sheet.byteLength);\n` +
      `envelope.set([0x51, 0x50, 0x45, 0x54, 0x01], 0);\n` +
      `new DataView(envelope.buffer).setUint16(5, manifestBytes.byteLength, true);\n` +
      `envelope.set(manifestBytes, 7);\n` +
      `envelope.set(sheet, 7 + manifestBytes.byteLength);\n` +
      `const decoded = await qscriptions.decodeQpetEnvelope(envelope);\n` +
      `assert.equal(decoded.ok, true);\n` +
      `assert.equal(decoded.value.manifest.id, "consumer-pet");\n` +
      `assert.equal(decoded.value.bodySha256, sha256);\n`,
  );
  execFileSync(process.execPath, ["consumer.mjs"], { cwd: consumer, stdio: "inherit" });

  await writeFile(
    join(consumer, "consumer.ts"),
    `import { decodeQpetEnvelope, type QpetResult, type QpetArtifact, type QscriptionProof } from "qscriptions";\n` +
      `const pending: Promise<QpetResult<QpetArtifact>> = decodeQpetEnvelope(new Uint8Array());\n` +
      `const proof: QscriptionProof = { content: { status: "unfetched" }, transaction: { status: "unverified" }, media: { status: "unchecked" }, chain: { status: "unknown", attestationSource: "none", inclusion: { status: "unchecked", method: "none" }, anchor: { status: "unchecked", method: "none" } } };\n` +
      `// @ts-expect-error verified inclusion cannot use the none method\n` +
      `const contradictory: QscriptionProof = { ...proof, chain: { ...proof.chain, inclusion: { status: "verified", method: "none" } } };\n` +
      `void pending; void proof; void contradictory;\n`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
        target: "ES2022",
      },
      files: ["consumer.ts"],
    }, null, 2)}\n`,
  );
  execFileSync(
    process.execPath,
    [join(SCRIPT_ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"],
    { cwd: consumer, stdio: "inherit" },
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}

console.log(`verified ${tarball}: ${entries.length} allowlisted files, clean ESM consumer passed`);
