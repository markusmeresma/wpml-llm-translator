import assert from "node:assert/strict";
import test from "node:test";

import { isAcfLayoutUnit } from "./acf-layout-filter.js";

test("detects canonical ACF layout key", () => {
  assert.equal(isAcfLayoutUnit("field-front-0-0", "hero"), true);
});

test("detects snake_case layout name", () => {
  assert.equal(isAcfLayoutUnit("field-front-0-4", "how_to_do"), true);
});

test("detects different field group", () => {
  assert.equal(isAcfLayoutUnit("field-page_content-0-2", "elastomer"), true);
});

test("rejects single suffix with real text", () => {
  assert.equal(isAcfLayoutUnit("field-front_0_title-0", "EXTERY urban furniture"), false);
});

test("rejects single suffix yoast field", () => {
  assert.equal(isAcfLayoutUnit("field-_yoast_wpseo_title-0", "%%title%%"), false);
});

test("rejects non-field unit", () => {
  assert.equal(isAcfLayoutUnit("title", "Front page"), false);
});

test("rejects double suffix with uppercase/spaces in source", () => {
  assert.equal(isAcfLayoutUnit("field-front-0-2", "About Us"), false);
});

test("rejects single suffix despite snake_case value", () => {
  assert.equal(isAcfLayoutUnit("field-details_subtitle-0", "wood"), false);
});
