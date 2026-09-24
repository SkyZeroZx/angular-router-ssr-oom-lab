import { ApplicationConfig } from "@angular/core";
import { provideRouter, withRouterConfig } from "@angular/router";
import { routes } from "./app.routes";

// One line, and every URL the application builds keeps the query string it was
// loaded with. This is the documented way to make filter state survive
// navigation; the Router replaces query parameters otherwise.
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withRouterConfig({ defaultQueryParamsHandling: "merge" })),
  ],
};
