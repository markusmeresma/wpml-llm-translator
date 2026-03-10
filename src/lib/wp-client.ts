export interface WpProduct {
  id: number;
  slug: string;
  link: string;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
}

const PRODUCTS_PER_PAGE = 100;

function buildProductsUrl(baseUrl: string, lang: string, page: number): URL {
  const url = new URL("/wp-json/wp/v2/product", baseUrl);
  url.searchParams.set("lang", lang);
  url.searchParams.set("per_page", String(PRODUCTS_PER_PAGE));
  url.searchParams.set("page", String(page));
  return url;
}

async function fetchProductsPage(baseUrl: string, lang: string, page: number): Promise<{
  products: WpProduct[];
  totalPages: number;
}> {
  const response = await fetch(buildProductsUrl(baseUrl, lang, page));

  if (!response.ok) {
    throw new Error(`WP API request failed for page ${page}: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new Error(`WP API returned a non-array payload for page ${page}`);
  }

  const totalPagesHeader = response.headers.get("x-wp-totalpages");
  const totalPages = Number(totalPagesHeader ?? "1");

  return {
    products: payload as WpProduct[],
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1
  };
}

export async function fetchAllProducts(baseUrl: string, lang: string): Promise<WpProduct[]> {
  const firstPage = await fetchProductsPage(baseUrl, lang, 1);

  if (firstPage.totalPages === 1) {
    return firstPage.products;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) => fetchProductsPage(baseUrl, lang, index + 2))
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.products);
}
