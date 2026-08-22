# Frozen QPET fixture

These repository-only files reconstruct the historical Qbit Genesis
inscription. The spritesheet is byte-exact; `pet.json` is equivalent source
metadata, and the single JSON record in `manifest.json` is the exact serialized
manifest carried by the envelope (excluding the file's final newline). They are
test inputs and are deliberately excluded from the published `qscriptions`
package.

- Envelope length: 9,548 bytes
- Envelope SHA-256: `e9a9ce232eeee3657e87053edf27b0b1f5493c9111d9a37c41fc5cdb85a24247`
- Spritesheet length: 8,616 bytes
- Spritesheet SHA-256: `8ea6a2514e745bc4393f9a46cb37d207c2448c716e331143cb80ba14b0654333`

Tests construct the envelope from `manifest.json` plus `spritesheet.webp` and
require the resulting exact bytes to reproduce those constants.
