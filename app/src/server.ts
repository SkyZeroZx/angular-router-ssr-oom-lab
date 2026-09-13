import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";

const app = express();
const deploymentHosts = (process.env["SSR_ALLOWED_HOSTS"] ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ["a", "nginx", "localhost", "127.0.0.1", ...deploymentHosts],
  trustProxyHeaders: ["x-forwarded-for", "x-forwarded-proto"],
});

app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  app.listen(4000, "0.0.0.0", (error) => {
    if (error) throw error;
    console.log("Angular SSR listening on :4000");
  });
}

export const reqHandler = createNodeRequestHandler(app);
