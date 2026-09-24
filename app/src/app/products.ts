import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";

// An ordinary e-commerce category page: a grid of products, the facet panel
// down the side, the sort control and a pager. A hundred links between them,
// which is unremarkable for a catalogue page.
//
// Nothing here opts into preserving the query string. The application asked for
// that once, in app.config.ts, so every URL this page builds carries the filter
// it was loaded with.
const env = (name: string) =>
  Number(
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name] ?? "",
  );

const PRODUCTS = env("PRODUCT_LINKS") || 48;
const BRANDS = env("BRAND_LINKS") || 20;
const COLOURS = env("COLOUR_LINKS") || 12;
const SIZES = env("SIZE_LINKS") || 8;
const PRICES = env("PRICE_LINKS") || 4;
const SORTS = env("SORT_LINKS") || 4;
const PAGES = env("PAGE_LINKS") || 4;

@Component({
  selector: "app-products",
  imports: [RouterLink],
  template: `
    <main>
      <h1>SSR OK</h1>

      <section class="grid">
        @for (id of products; track id) {
          <a [routerLink]="['/products', id]">Product {{ id }}</a>
        }
      </section>

      <aside class="facets">
        @for (brand of brands; track brand) {
          <a [routerLink]="['/products']" [queryParams]="{ brand }">{{ brand }}</a>
        }
        @for (colour of colours; track colour) {
          <a [routerLink]="['/products']" [queryParams]="{ colour }">{{ colour }}</a>
        }
        @for (size of sizes; track size) {
          <a [routerLink]="['/products']" [queryParams]="{ size }">{{ size }}</a>
        }
        @for (price of prices; track price) {
          <a [routerLink]="['/products']" [queryParams]="{ price }">{{ price }}</a>
        }
      </aside>

      <nav class="sort">
        @for (sort of sorts; track sort) {
          <a [routerLink]="['/products']" [queryParams]="{ sort }">{{ sort }}</a>
        }
      </nav>

      <nav class="pager">
        @for (page of pages; track page) {
          <a [routerLink]="['/products']" [queryParams]="{ page }">{{ page }}</a>
        }
      </nav>
    </main>
  `,
})
export class Products {
  protected readonly products = Array.from({ length: PRODUCTS }, (_, i) => i + 1);
  protected readonly brands = Array.from({ length: BRANDS }, (_, i) => `brand-${i + 1}`);
  protected readonly colours = Array.from({ length: COLOURS }, (_, i) => `colour-${i + 1}`);
  protected readonly sizes = Array.from({ length: SIZES }, (_, i) => `${38 + i}`);
  protected readonly prices = Array.from({ length: PRICES }, (_, i) => `${i * 50}-${(i + 1) * 50}`);
  protected readonly sorts = Array.from({ length: SORTS }, (_, i) => `sort-${i + 1}`);
  protected readonly pages = Array.from({ length: PAGES }, (_, i) => `${i + 1}`);
}
