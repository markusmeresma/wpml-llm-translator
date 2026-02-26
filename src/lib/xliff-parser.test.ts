import assert from "node:assert/strict";
import test from "node:test";

import { parseXliffFile } from "./xliff-parser.js";

test("parseXliffFile extracts metadata and units", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file original="job-1007">
    <header>
      <skl>
        <external-file href="https://example.com/page" />
      </skl>
    </header>
    <body>
      <trans-unit id="title" resname="title" restype="string">
        <source><![CDATA[Hello world]]></source>
        <target><![CDATA[]]></target>
      </trans-unit>
      <trans-unit id="description" resname="description" restype="string">
        <source><![CDATA[Line <strong>one</strong>]]></source>
      </trans-unit>
    </body>
  </file>
</xliff>`;

  const parsed = parseXliffFile({
    fileKey: "job-1007.xliff",
    xml
  });

  assert.equal(parsed.originalAttr, "job-1007");
  assert.equal(parsed.externalHref, "https://example.com/page");
  assert.equal(parsed.units.length, 2);
  assert.deepEqual(parsed.units[0], {
    unitKey: "title",
    resname: "title",
    restype: "string",
    sourceText: "Hello world"
  });
  assert.equal(parsed.units[1]?.sourceText, "Line <strong>one</strong>");
});
