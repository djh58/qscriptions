#!/usr/bin/env python3
"""Small JSON adapter around the exact-pinned historical Python QPET oracle."""

import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def load_oracle(path: str):
    oracle_path = Path(path).resolve(strict=True)
    spec = importlib.util.spec_from_file_location("qpet_parity_oracle", oracle_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load Python QPET oracle")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_case(qpet, case):
    data = base64.b64decode(case["bytes"], validate=True)
    try:
        if case["operation"] == "extract":
            payload = qpet.script_pushes(data)
            return {"ok": True, "payload": base64.b64encode(payload).decode("ascii")}
        manifest, sheet = qpet.decode_envelope(data)
        body_sha256 = qpet.validate_manifest(manifest, sheet)
        # The TypeScript artifact normalizes an accepted uppercase declaration.
        manifest["sheet"]["sha256"] = body_sha256
        return {
            "ok": True,
            "manifest": manifest,
            "bodySha256": hashlib.sha256(sheet).hexdigest(),
        }
    except (KeyError, TypeError, ValueError):
        return {"ok": False}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python-qpet-driver.py /path/to/qpet.py")
    qpet = load_oracle(sys.argv[1])
    cases = json.load(sys.stdin)
    json.dump([run_case(qpet, case) for case in cases], sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
