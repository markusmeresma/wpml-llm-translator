import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface HtmlSplitResult {
  template: string;
  segments: string[];
}

type CheerioSelection = cheerio.Cheerio<AnyNode>;

const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "ul", "ol", "li", "blockquote",
  "section", "article", "header", "footer", "main", "nav", "aside",
  "figure", "figcaption", "details", "summary"
]);

const INLINE_FORMATTING_TAGS = new Set([
  "strong", "b", "em", "i", "u", "s", "del", "ins",
  "mark", "small", "sub", "sup", "span"
]);

/**
 * Check if an HTML string contains block-level elements.
 */
function containsBlockElements(html: string): boolean {
  const blockPattern = /<(?:h[1-6]|p|div|ul|ol|li|blockquote|section|article|header|footer|main|nav|aside|figure|figcaption|details|summary)[\s>]/i;
  return blockPattern.test(html);
}

/**
 * Extract clean text content from cheerio element, preserving <a> tags
 * but stripping other inline formatting tags.
 */
function extractCleanText($: cheerio.CheerioAPI, el: CheerioSelection): string {
  const parts: string[] = [];

  el.contents().each((_, node) => {
    if (node.type === "text") {
      parts.push($(node).text());
    } else if (node.type === "tag") {
      const tagName = (node as Element).tagName.toLowerCase();

      if (tagName === "a") {
        const aEl = $(node);
        const href = aEl.attr("href") ?? "";
        const innerText = extractCleanText($, aEl);
        if (href) {
          parts.push(`<a href="${href}">${innerText}</a>`);
        } else {
          parts.push(innerText);
        }
      } else if (INLINE_FORMATTING_TAGS.has(tagName)) {
        parts.push(extractCleanText($, $(node)));
      } else {
        parts.push(extractCleanText($, $(node)));
      }
    }
  });

  return parts.join("");
}

/**
 * Check if a block element has meaningful translatable text.
 */
function hasTranslatableText($: cheerio.CheerioAPI, el: CheerioSelection): boolean {
  const text = el.text().trim();
  return text.length > 0;
}

/**
 * Wrap inline formatting tags around a placeholder in the template.
 */
function buildPlaceholderContent($: cheerio.CheerioAPI, el: CheerioSelection, placeholder: string): void {
  const children = el.children();

  if (children.length === 1) {
    const child = children.first();
    const childTag = (child.get(0) as Element | undefined)?.tagName?.toLowerCase();

    if (childTag && INLINE_FORMATTING_TAGS.has(childTag)) {
      buildPlaceholderContent($, child, placeholder);
      return;
    }
  }

  el.empty();
  el.append(placeholder);
}

/**
 * Split HTML containing block elements into a template + clean text segments.
 * Returns null if the HTML doesn't contain block elements.
 */
export function splitHtmlIntoSegments(html: string): HtmlSplitResult | null {
  if (!containsBlockElements(html)) {
    return null;
  }

  const $ = cheerio.load(html, { xml: false });
  const body = $("body");
  const segments: string[] = [];
  let segmentIndex = 0;

  body.children().each((_, node) => {
    if (node.type !== "tag") {
      return;
    }

    const el = $(node);
    const tagName = (node as Element).tagName.toLowerCase();

    if (!BLOCK_TAGS.has(tagName)) {
      return;
    }

    if (!hasTranslatableText($, el)) {
      return;
    }

    const cleanText = extractCleanText($, el).trim();

    if (!cleanText) {
      return;
    }

    segmentIndex += 1;
    segments.push(cleanText);
    buildPlaceholderContent($, el, `{{${segmentIndex}}}`);
  });

  if (segments.length === 0) {
    return null;
  }

  const template = body.html() ?? "";

  return { template, segments };
}

/**
 * Reassemble HTML from a template and translated segments.
 */
export function reassembleHtml(template: string, segments: Map<number, string>): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_, n) => segments.get(Number(n)) ?? "");
}
