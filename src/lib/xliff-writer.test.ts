import assert from "node:assert/strict";
import test from "node:test";

import { rebuildXliffTargets } from "./xliff-writer.js";

test("rebuildXliffTargets updates target cdata by trans-unit id", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file original="job-1007">
    <body>
      <trans-unit id="title">
        <source><![CDATA[Hello]]></source>
        <target><![CDATA[Old]]></target>
      </trans-unit>
      <trans-unit id="description">
        <source><![CDATA[World]]></source>
      </trans-unit>
    </body>
  </file>
</xliff>`;

  const rebuilt = rebuildXliffTargets({
    fileKey: "job-1007.xliff",
    xml,
    translationsByUnitKey: new Map([
      ["title", "Witaj"],
      ["description", "Swiat"]
    ])
  });

  assert.equal(rebuilt.updatedCount, 2);
  assert.deepEqual(rebuilt.missingUnitKeys, []);
  assert.match(rebuilt.xml, /<target><!\[CDATA\[Witaj\]\]><\/target>/);
  assert.match(rebuilt.xml, /<target><!\[CDATA\[Swiat\]\]><\/target>/);
});

test("rebuildXliffTargets reports unit ids missing from xml", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file original="job-1008">
    <body>
      <trans-unit id="title">
        <source><![CDATA[Hello]]></source>
        <target><![CDATA[Old]]></target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

  const rebuilt = rebuildXliffTargets({
    fileKey: "job-1008.xliff",
    xml,
    translationsByUnitKey: new Map([["missing", "x"]])
  });

  assert.equal(rebuilt.updatedCount, 0);
  assert.deepEqual(rebuilt.missingUnitKeys, ["missing"]);
});
