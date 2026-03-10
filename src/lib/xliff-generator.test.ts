import assert from "node:assert/strict";
import test from "node:test";

import { parseXliffFile } from "./xliff-parser.js";
import { generateProductXliff } from "./xliff-generator.js";

test("generateProductXliff emits parser-compatible XLIFF with product metadata", () => {
  const xml = generateProductXliff({
    sourceLang: "en",
    targetLang: "et",
    product: {
      id: 42,
      slug: "tiide-planter",
      link: "https://example.com/en/products/tiide-planter/",
      title: {
        rendered: "Tiide planter"
      },
      content: {
        rendered: "<p>Outdoor planter</p>\n"
      },
      excerpt: {
        rendered: "<p>Short summary [&hellip;]</p>\n"
      }
    }
  });

  assert.match(xml, /source-language="en"/);
  assert.match(xml, /target-language="et"/);
  assert.match(xml, /external-file href="https:\/\/example.com\/en\/products\/tiide-planter\/"/);

  const parsed = parseXliffFile({
    fileKey: "product-tiide-planter.xliff",
    xml
  });

  assert.equal(parsed.originalAttr, "product-42");
  assert.equal(parsed.externalHref, "https://example.com/en/products/tiide-planter/");
  assert.deepEqual(
    parsed.units.map((unit) => unit.unitKey),
    ["title", "body", "excerpt"]
  );
  assert.equal(parsed.units[2]?.sourceText, "Short summary [&hellip;]");
});

test("generateProductXliff omits empty units", () => {
  const xml = generateProductXliff({
    sourceLang: "en",
    targetLang: "et",
    product: {
      id: 7,
      slug: "look-bench",
      link: "https://example.com/en/products/look-bench/",
      title: {
        rendered: "Look bench"
      },
      content: {
        rendered: ""
      },
      excerpt: {
        rendered: "<p>\n</p>\n"
      }
    }
  });

  const parsed = parseXliffFile({
    fileKey: "product-look-bench.xliff",
    xml
  });

  assert.deepEqual(
    parsed.units.map((unit) => unit.unitKey),
    ["title"]
  );
});
