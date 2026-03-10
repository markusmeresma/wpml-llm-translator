import assert from "node:assert/strict";
import test from "node:test";

import { buildFamilyMap, matchProductToFamily, prepareFamilyMatchers, toFamilyFolderName } from "./family-mapping.js";

test("prepareFamilyMatchers prefers longer family names first", () => {
  const matchers = prepareFamilyMatchers(["Nippon", "Nippon Ebe", "Klaar Wood"]);

  assert.deepEqual(
    matchers.map((matcher) => matcher.displayName),
    ["Klaar Wood", "Nippon Ebe", "Nippon"]
  );
});

test("matchProductToFamily matches title and slug using normalized family names", () => {
  const matchers = prepareFamilyMatchers(["Nippon", "Nippon Ebe", "DogStation"]);

  const titleMatch = matchProductToFamily(
    {
      slug: "bench-nippon-ebe",
      title: { rendered: "Bench Nippon Ebe" }
    },
    matchers
  );
  const slugMatch = matchProductToFamily(
    {
      slug: "dogstation-bike-rack",
      title: { rendered: "Bike rack" }
    },
    matchers
  );

  assert.equal(titleMatch?.folderName, "nippon-ebe");
  assert.equal(slugMatch?.folderName, "dogstation");
});

test("buildFamilyMap falls back to uncategorized for unmatched products", () => {
  const result = buildFamilyMap(
    [
      { slug: "tiide-planter", title: { rendered: "Tiide planter" } },
      { slug: "mystery-product", title: { rendered: "Mystery product" } }
    ],
    ["Tiide"]
  );

  assert.equal(result.map["tiide-planter"], "tiide");
  assert.equal(result.map["mystery-product"], "uncategorized");
  assert.deepEqual(result.unmatched.map((product) => product.slug), ["mystery-product"]);
});

test("toFamilyFolderName slugifies multi-word family names", () => {
  assert.equal(toFamilyFolderName("Klaar Wood"), "klaar-wood");
});
