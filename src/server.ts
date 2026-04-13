import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? "3210");

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`agent-commerce listening on http://localhost:${info.port}`);
});
