import assert from "node:assert/strict";
import test from "node:test";

import { releaseChannel } from "../dist/index.js";

test("the publication canary is explicitly labeled", () => {
  assert.equal(releaseChannel, "canary");
});
