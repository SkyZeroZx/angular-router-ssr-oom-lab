import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

@Component({
  selector: "app-page",
  template: "<main><h1>SSR OK</h1><p>{{ segmentCount }}</p></main>",
})
export class Page {
  private readonly route = inject(ActivatedRoute);
  protected readonly segmentCount = this.route.snapshot.url.length;
}
