import { Routes } from "@angular/router";
import { Page } from "./page";

// Briefly retain request-scoped UrlTrees so concurrent requests overlap.
const loadPage = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  return true;
};

export const routes: Routes = [
  { path: "**", component: Page, resolve: { page: loadPage } },
];
