import { Routes } from "@angular/router";
import { Filters } from "./filters";
import { Page } from "./page";
import { Products } from "./products";

// Hold request-scoped UrlTrees so concurrent requests overlap. Parsing a long
// URL is CPU-bound, so too short a hold serializes them and the heap never fills.
const HOLD_MS =
  Number(
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.["RESOLVER_HOLD_MS"] ?? "",
  ) || 1000;

const loadPage = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, HOLD_MS));
  return true;
};

export const routes: Routes = [
  // Filter panel: a flat route that builds one URL per facet, sort and page.
  { path: "products", component: Products, resolve: { page: loadPage } },
  // Same filters, but the page builds no URLs at all.
  { path: "filters", component: Filters, resolve: { page: loadPage } },
  // Matrix-parameter workload: any path, parsed into per-segment parameter maps.
  { path: "**", component: Page, resolve: { page: loadPage } },
];
