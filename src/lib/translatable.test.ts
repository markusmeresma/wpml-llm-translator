const assert: typeof import("node:assert/strict") = require("node:assert/strict");
const test: (typeof import("node:test"))["test"] = require("node:test");
const { extractProse, isTranslatable }: typeof import("./translatable.js") = require("./translatable.ts");

test("isTranslatable returns false for pure PHP code", () => {
  const source = `<?php echo do_shortcode('[gallery ids="1,2,3"]'); ?>`;
  assert.equal(isTranslatable(source), false);
});

test("isTranslatable returns false for CSS-only content", () => {
  const source = `.box { color: #333; margin: 0; } @media screen { .inner { display: none; } }`;
  assert.equal(isTranslatable(source), false);
});

test("isTranslatable returns true for HTML that wraps prose", () => {
  const source = `<h2><strong>Urban Furniture for Public Spaces</strong></h2>`;
  assert.equal(isTranslatable(source), true);
});

test("isTranslatable returns true for plain text", () => {
  const source = `This page explains our municipal maintenance services.`;
  assert.equal(isTranslatable(source), true);
});

test("isTranslatable returns true for mixed code and prose", () => {
  const source = `<?php if ($enabled) { echo "x"; } ?><p>Reliable benches and shelters for cities.</p>`;
  assert.equal(isTranslatable(source), true);
});

test("isTranslatable returns false for one- or two-word strings", () => {
  assert.equal(isTranslatable("Hello"), false);
  assert.equal(isTranslatable("Urban furniture"), false);
});

test("extractProse strips code and markup while preserving readable text", () => {
  const source = `<style>.hero { color: red; }</style><h2><strong>Urban Furniture &amp; Planning</strong></h2><script>console.log("x")</script>`;
  assert.equal(extractProse(source), "Urban Furniture & Planning");
});
