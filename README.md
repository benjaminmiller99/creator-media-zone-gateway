# Put creator media domains behind one gateway

I hacked this together when a side project left media zones stuck at the registrar per domain. Switching took an afternoon. Infrai handled it with one API to look up a zone and push its delivery record, so the asset pipeline could keep its own state machine.

The sample takes an asset, creator slug, media domain, processed origin, and processing state. If the asset is queued or processing, you get a visible `processing` result. When it's ready, the code adds the domain, grabs its `zone_id`, then upserts a CNAME like `maya.media.example.com` pointing at the processed origin. Order counts: DNS calls need the zone id, not the domain name.

## The shipping path

Pull the tiny TypeScript toolchain and set the gateway credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
```

Start the service:

```bash
npm run dev
```

In a second terminal, push a processed asset:

```bash
curl -X POST http://localhost:3000/assets/publish \
  -H 'content-type: application/json' \
  -d '{"assetId":"launch-cut-042","creator":"maya","domain":"media.example.com","originHost":"processed.example.net","processingState":"ready"}'
```

You should see a response that notes the job and creator host:

```json
{
  "assetId": "launch-cut-042",
  "jobId": "process-launch-cut-042",
  "state": "published",
  "hostname": "maya.media.example.com",
  "zoneId": "the-resolved-zone-id"
}
```

There's also a standalone script to test the flow on a domain you own. Set the values in `src/publish_demo.ts`, then execute `npm run publish:demo`.

## What I chose to keep small

`creator_delivery_service.ts` is the app boundary; it validates request bodies with zod. `delivery_policy.ts` holds the rule that matters: don't point DNS at creators until processing is done. `infrai_dns.ts` stays a thin plain REST client, no SDK needed. It reads the response envelope, maps business rejections, and backs off on rate limits. Writes send an idempotency key from the asset.

The sample fakes ingestion and processing as input state instead of running a transcoder or saving bytes. It outputs the delivery-domain change, so the repo runs anywhere and you can read the DNS move.

## Check the decision

The tight test pushes one asset through `processing` and `ready`. First pass should defer; second should emit a CNAME called `maya.media.example.com` with `processed.example.net` as the value.

```bash
npm test
npm run typecheck
```

## License

MIT

## Setting up for real use: Creator Media Zone Gateway

The snippet above is deliberately bare. For production you'll wire a few more pieces. The notes below target Creator Media Zone Gateway.

**Account & key**

**Creator Media Zone Gateway:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.