import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

// A filter page. It renders no links and builds no URLs, it only reads the
// filters it was loaded with. The Router still hands every route level along
// the way its own frozen copy of the query-parameter map.
@Component({
  selector: "app-filters",
  template: "<main><h1>SSR OK</h1><p>{{ activeFilters }}</p></main>",
})
export class Filters {
  private readonly route = inject(ActivatedRoute);
  protected readonly activeFilters = Object.keys(this.route.snapshot.queryParams).length;
}
