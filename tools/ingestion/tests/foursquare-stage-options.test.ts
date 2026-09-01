import assert from "node:assert/strict";
import test from "node:test";
import { foursquareStageHelp, parseFoursquareStageOptions } from "../src/cli/foursquare-stage-options.js";

const sourceId = "71aad752-1586-459f-9540-7f7c81c12300";

test("Foursquare staging accepts a bounded run or an unbounded --all run", () => {
  assert.deepEqual(parseFoursquareStageOptions(["--source-id", sourceId, "--limit", "5000"]), {
    sourceId, mode: { kind: "limited", limit: 5000 }, probeOnly: false, help: false,
  });
  assert.deepEqual(parseFoursquareStageOptions(["--source-id", sourceId, "--all", "--probe"]), {
    sourceId, mode: { kind: "all" }, probeOnly: true, help: false,
  });
});

test("Foursquare staging requires exactly one import mode", () => {
  assert.throws(() => parseFoursquareStageOptions(["--source-id", sourceId]));
  assert.throws(() => parseFoursquareStageOptions(["--source-id", sourceId, "--limit", "1", "--all"]));
  assert.throws(() => parseFoursquareStageOptions(["--source-id", sourceId, "--limit", "5001"]));
});

test("Foursquare staging help documents all supported switches", () => {
  const help = foursquareStageHelp();
  for (const option of ["--source-id <uuid>", "--limit <1-5000>", "--all", "--run-id <uuid>", "--probe"]) assert.match(help, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
});
