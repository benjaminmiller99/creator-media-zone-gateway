import assert from "node:assert/strict";
import test from "node:test";
import { resolveZoneDomain } from "../src/creator_delivery.js";
import { decideDelivery } from "../src/delivery_policy.js";

test("resolves the registrable DNS zone from a media subdomain", () => {
  assert.equal(resolveZoneDomain("media.example.com"), "example.com");
  assert.equal(resolveZoneDomain("media.example.co.uk"), "example.co.uk");
});

test("publishes a creator CNAME only after processing is ready", () => {
  assert.deepEqual(decideDelivery({
    assetId: "launch-cut-042",
    creator: "maya",
    domain: "media.example.com",
    originHost: "processed.example.net",
    processingState: "processing",
  }), {
    action: "defer",
    jobId: "process-launch-cut-042",
    reason: "processing_not_ready",
  });
  assert.deepEqual(decideDelivery({
    assetId: "launch-cut-042",
    creator: "maya",
    domain: "media.example.com",
    originHost: "processed.example.net",
    processingState: "ready",
  }), {
    action: "publish",
    jobId: "process-launch-cut-042",
    record: {
      record_type: "CNAME",
      name: "maya.media.example.com",
      content: "processed.example.net",
      ttl: 300,
      proxied: true,
    },
  });
});
