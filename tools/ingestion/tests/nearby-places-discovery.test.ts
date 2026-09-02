import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ew_nearby_places remains restricted to active/discoverable places", async () => {
  const migration = await readFile(
    new URL("../../../supabase/migrations/20260902111528_create_nearby_places_rpc.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /where place\.status = 'active'/u);
  assert.match(migration, /category\.is_active/u);
});
