export interface FamilyProductCandidate {
  slug: string;
  title: {
    rendered: string;
  };
}

export interface PreparedFamilyMatcher {
  displayName: string;
  folderName: string;
  normalizedName: string;
}

export interface BuildFamilyMapResult {
  map: Record<string, string>;
  unmatched: FamilyProductCandidate[];
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsNormalizedNeedle(haystack: string, needle: string): boolean {
  return haystack === needle || haystack.startsWith(`${needle} `) || haystack.endsWith(` ${needle}`) || haystack.includes(` ${needle} `);
}

export function toFamilyFolderName(familyName: string): string {
  const folderName = familyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return folderName || "uncategorized";
}

export function prepareFamilyMatchers(familyNames: string[]): PreparedFamilyMatcher[] {
  return [...new Set(familyNames.map((name) => name.trim()).filter(Boolean))]
    .map((displayName) => ({
      displayName,
      folderName: toFamilyFolderName(displayName),
      normalizedName: normalizeMatchText(displayName)
    }))
    .sort((left, right) => {
      if (right.normalizedName.length !== left.normalizedName.length) {
        return right.normalizedName.length - left.normalizedName.length;
      }

      return left.displayName.localeCompare(right.displayName);
    });
}

export function matchProductToFamily(
  product: FamilyProductCandidate,
  matchers: PreparedFamilyMatcher[]
): PreparedFamilyMatcher | null {
  const normalizedTitle = normalizeMatchText(product.title.rendered);
  const normalizedSlug = normalizeMatchText(product.slug);

  for (const matcher of matchers) {
    if (
      containsNormalizedNeedle(normalizedTitle, matcher.normalizedName) ||
      containsNormalizedNeedle(normalizedSlug, matcher.normalizedName)
    ) {
      return matcher;
    }
  }

  return null;
}

export function buildFamilyMap(
  products: FamilyProductCandidate[],
  familyNames: string[]
): BuildFamilyMapResult {
  const matchers = prepareFamilyMatchers(familyNames);
  const mapEntries: Array<[string, string]> = [];
  const unmatched: FamilyProductCandidate[] = [];

  for (const product of products) {
    const match = matchProductToFamily(product, matchers);

    if (match) {
      mapEntries.push([product.slug, match.folderName]);
      continue;
    }

    mapEntries.push([product.slug, "uncategorized"]);
    unmatched.push(product);
  }

  mapEntries.sort((left, right) => left[0].localeCompare(right[0]));

  return {
    map: Object.fromEntries(mapEntries),
    unmatched
  };
}
