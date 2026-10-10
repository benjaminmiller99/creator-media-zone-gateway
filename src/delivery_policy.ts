import { z } from "zod";

export const PublishAssetBody = z.object({
  assetId: z.string().min(1),
  creator: z.string().regex(/^[a-z0-9-]+$/),
  domain: z.string().min(3),
  originHost: z.string().min(3),
  processingState: z.enum(["queued", "processing", "ready", "failed"]),
});

export type PublishAsset = z.infer<typeof PublishAssetBody>;

export type DeliveryDecision =
  | { action: "defer"; jobId: string; reason: "processing_not_ready" }
  | { action: "publish"; jobId: string; record: { record_type: "CNAME"; name: string; content: string; ttl: number; proxied: boolean } };

export function decideDelivery(input: PublishAsset): DeliveryDecision {
  const jobId = `process-${input.assetId}`;
  if (input.processingState !== "ready") {
    return { action: "defer", jobId, reason: "processing_not_ready" };
  }
  return {
    action: "publish",
    jobId,
    record: {
      record_type: "CNAME",
      name: `${input.creator}.${input.domain}`,
      content: input.originHost,
      ttl: 300,
      proxied: true,
    },
  };
}
