import { Routes } from "@angular/router";
import { Page } from "./page";

// Hold request-scoped UrlTrees so concurrent requests overlap. Parsing a long
// path is CPU-bound, so too short a hold serializes them and the heap never fills.
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
  { path: "**", component: Page, resolve: { page: loadPage } },
];
