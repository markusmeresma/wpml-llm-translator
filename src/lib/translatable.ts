const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entityRaw: string) => {
    if (entityRaw.startsWith("#x") || entityRaw.startsWith("#X")) {
      const codePoint = Number.parseInt(entityRaw.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (entityRaw.startsWith("#")) {
      const codePoint = Number.parseInt(entityRaw.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    const named = NAMED_HTML_ENTITIES[entityRaw.toLowerCase()];
    return named ?? match;
  });
}

function stripCssBlocks(input: string): string {
  let output = input;
  let previous = "";

  // Repeatedly remove brace blocks so nested rules like @media are collapsed.
  while (output !== previous) {
    previous = output;
    output = output.replace(/[^{}]*\{[^{}]*\}/g, " ");
  }

  return output;
}

function countWords(input: string): number {
  const words = input.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  return words.length;
}

export function extractProse(source: string): string {
  if (!source) {
    return "";
  }

  let cleaned = source;

  cleaned = cleaned.replace(/<\?(?:php|=)?[\s\S]*?\?>/gi, " ");
  cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  cleaned = stripCssBlocks(cleaned);
  cleaned = cleaned.replace(/\b[a-z-]+\s*:\s*[^;{}]+;/gi, " ");
  cleaned = cleaned.replace(/<\/?[^>]+>/g, " ");
  cleaned = decodeHtmlEntities(cleaned);
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export function isTranslatable(source: string): boolean {
  return countWords(extractProse(source)) >= 3;
}
