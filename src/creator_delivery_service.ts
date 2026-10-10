import { createServer } from "node:http";
import { ZodError } from "zod";
import { publishCreatorAsset } from "./creator_delivery.js";
import { PublishAssetBody } from "./delivery_policy.js";
import { InfraiDns, InfraiError } from "./infrai_dns.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const dns = new InfraiDns(apiKey);

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/assets/publish") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = PublishAssetBody.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await publishCreatorAsset(input, dns);
    response.writeHead(result.state === "published" ? 201 : 202).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(502).end(JSON.stringify({ error: "gateway_request_failed" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Creator delivery service listening on http://localhost:${port}`));
