import type { WpProduct, ProductPageExtras } from "./wp-client.js";

export interface GenerateProductXliffInput {
  product: WpProduct;
  extras?: ProductPageExtras;
  sourceLang: string;
  targetLang: string;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function wrapInCdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function stripWrappedExcerptParagraph(excerpt: string): string {
  const trimmed = excerpt.trim();
  const match = /^<p>([\s\S]*)<\/p>$/i.exec(trimmed);

  return match?.[1] ?? excerpt.trimEnd();
}

function renderTransUnit(id: string, sourceText: string): string {
  return [
    `      <trans-unit id="${id}" resname="${id}" restype="string">`,
    `        <source>${wrapInCdata(sourceText)}</source>`,
    "        <target><![CDATA[]]></target>",
    "      </trans-unit>"
  ].join("\n");
}

export function generateProductXliff(input: GenerateProductXliffInput): string {
  const units: string[] = [];
  const title = input.product.title.rendered;
  const body = input.product.content.rendered;
  const excerpt = stripWrappedExcerptParagraph(input.product.excerpt.rendered);

  if (title.trim()) {
    units.push(renderTransUnit("title", title));
  }

  if (body.trim()) {
    units.push(renderTransUnit("body", body));
  }

  if (excerpt.trim()) {
    units.push(renderTransUnit("excerpt", excerpt));
  }

  if (input.extras?.features) {
    units.push(renderTransUnit("features", input.extras.features));
  }

  if (input.extras?.installation) {
    units.push(renderTransUnit("installation", input.extras.installation));
  }

  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\" standalone=\"no\"?>",
    "<xliff xmlns=\"urn:oasis:names:tc:xliff:document:1.2\" version=\"1.2\">",
    `  <file original="${escapeXmlAttribute(`product-${input.product.id}`)}" source-language="${escapeXmlAttribute(input.sourceLang)}" target-language="${escapeXmlAttribute(input.targetLang)}">`,
    "    <header>",
    "      <reference>",
    `        <external-file href="${escapeXmlAttribute(input.product.link)}" />`,
    "      </reference>",
    "    </header>",
    "    <body>",
    units.join("\n"),
    "    </body>",
    "  </file>",
    "</xliff>",
    ""
  ].join("\n");
}
