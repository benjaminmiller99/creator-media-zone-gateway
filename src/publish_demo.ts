import { publishCreatorAsset } from "./creator_delivery.js";
import { InfraiDns } from "./infrai_dns.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the demo");

const result = await publishCreatorAsset(
  {
    assetId: "launch-cut-042",
    creator: "maya",
    domain: "media.example.com",
    originHost: "processed.example.net",
    processingState: "ready",
  },
  new InfraiDns(apiKey),
);
console.log(JSON.stringify(result, null, 2));
