import { decideDelivery, type PublishAsset } from "./delivery_policy.js";
import { InfraiDns } from "./infrai_dns.js";
import { getDomain } from "tldts";

export type PublishResult =
  | { assetId: string; jobId: string; state: "processing" }
  | { assetId: string; jobId: string; state: "published"; hostname: string; zoneId: string };

export function resolveZoneDomain(hostname: string): string {
  const domain = getDomain(hostname);
  if (!domain) throw new Error(`Could not resolve a DNS zone for ${hostname}`);
  return domain;
}

export async function publishCreatorAsset(input: PublishAsset, dns: InfraiDns): Promise<PublishResult> {
  const decision = decideDelivery(input);
  if (decision.action === "defer") {
    return { assetId: input.assetId, jobId: decision.jobId, state: "processing" };
  }

  const zone = await dns.addDomain(resolveZoneDomain(input.domain));

  await dns.upsertRecord(
    {
      zone_id: zone.zone_id,
      record_type: decision.record.record_type,
      name: decision.record.name,
      content: decision.record.content,
      ttl: decision.record.ttl,
      proxied: decision.record.proxied,
    },
    `asset-${input.assetId}-delivery`,
  );
  return {
    assetId: input.assetId,
    jobId: decision.jobId,
    state: "published",
    hostname: decision.record.name,
    zoneId: zone.zone_id,
  };
}
