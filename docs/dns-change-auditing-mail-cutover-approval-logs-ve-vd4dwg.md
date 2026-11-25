# DNS Change Auditing: Mail Cutover Approval Logs Versus Propagation Evidence

A company mail cutover has two clocks: the record write and the point at which someone observes the new answer. For an e-commerce team pointing company mail at a new provider, treating those clocks as one makes a quick cutover difficult to audit. A current MX listing cannot tell you who requested the change.

TL;DR: Keep the who-changed-what record in searchable application audit logs, captured where your service still knows the actor and zone. Pair those events with scheduled zone listings to detect changes made outside the service. Track propagation observations separately; a successful write is not evidence that every observer has the new answer.

This engineering note evaluates evidence custody, with one constraint: a current-state read cannot reconstruct the identity behind an earlier request. There is no measured propagation benchmark here. The useful result is a decision rule: approve cutover speed against observable delivery requirements, while preserving attribution at the moment of each write.

## Where should the record of who changed DNS live?

Put it at the call site. That is where the service can connect an authenticated person or automation identity to the zone being changed. A DNS listing supplies state; the application has the context explaining why that state was requested. Keep the resulting events searchable by actor, zone, and a change identifier you control. These are fields in your audit design, not promises about a particular vendor's query interface.

Consider an online store moving its company mail provider. The intended MX target, the actor approving the move, and the record observed afterward answer different questions. An approval establishes intent. A write outcome records what the service was told about the operation. A later zone listing establishes what that listing returned. When those pieces are collapsed into one message saying that mail was migrated, a reviewer loses the distinctions needed to investigate a disputed change. The same ambiguity makes rollback decisions harder: a new observation does not identify who authorized the earlier value, and an old approval does not establish the current record.

Keep those distinctions.

The tempting approach is to save the final zone export and treat it as the audit trail. It fails the attribution test even if the export is accurate. The chosen approach preserves the actor at the write boundary, then uses subsequent listings as independent observations. Neither an export nor a request log can replace the other.

For an AI app builder, this also draws a useful boundary around an assistant that prepares a mail configuration. Record the authenticated operator or service principal responsible for the action; generated text explaining a suggested change is not an actor identity. Keep a stable change identifier so an investigation can retrieve the relevant evidence directly, without asking a model to infer authorization from a conversation transcript.

## Capture intent without manufacturing a successful cutover

The following TypeScript example retrieves the public capability manifest before printing one proposed audit event for a fictional store. It is a preflight, not a DNS mutation. Set `INFRAI_BASE_URL` to the service's documented v1 API base and `INFRAI_API_KEY` through your environment. The MX values, priority, TTL, actor, and timestamp are illustrative inputs. Save it as a TypeScript file and run it with a TypeScript-capable runtime that supplies fetch.

```ts
const apiBase = process.env.INFRAI_BASE_URL;
const apiKey = process.env.INFRAI_API_KEY;
if (!apiBase || !apiKey) {
  throw new Error("Set INFRAI_BASE_URL and INFRAI_API_KEY");
}

async function inspectCapabilities(): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${apiBase!.replace(/\/$/, "")}/discovery`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (response.status === 429 && attempt < 2) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const serverDelay = Number.isFinite(seconds)
        ? seconds * 1000
        : retryAfter === null ? 0 : Date.parse(retryAfter) - Date.now();
      const delay = Math.max(
        1000 * 2 ** attempt,
        Number.isFinite(serverDelay) ? serverDelay : 0
      );
      await response.arrayBuffer();
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Discovery ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }
  throw new Error("Discovery retry limit reached");
}

const event = {
  changeId: "company-mail-cutover-001",
  actorId: "operator:mail-admin",
  zone: "shop.example",
  owner: "shop.example",
  recordType: "MX",
  stage: "requested",
  requestedAt: "2026-11-20T09:00:00Z",
  before: {
    exchange: "old-mail.example",
    priority: 10,
    ttlSeconds: 3600
  },
  after: {
    exchange: "new-mail.example",
    priority: 10,
    ttlSeconds: 300
  },
  reason: "Approved company mail provider cutover"
};

if (!event.actorId || !event.zone || !event.changeId) {
  throw new Error("Audit identity, zone, and change ID are required");
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ capabilities: await inspectCapabilities() }));
  console.log(JSON.stringify(event));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

The discovery request is read-only, and the surface is public even though this example supplies the environment credential. Its retry budget is 3 attempts, with fallback waits of 1000 ms and 2000 ms after HTTP 429; a longer Retry-After takes precedence. Inspect the returned capability descriptions before implementing a write adapter; this example intentionally makes no assumptions about DNS request fields. The audit object's fields belong to the application and are not an API payload.

The small detail that matters is `stage: "requested"`. Printing this object proves neither persistence nor a successful DNS change. In a deployed service, take actor identity from trusted authentication context, persist the request event, and attach the actual write outcome under the same change identifier. A later observation should retain its own timestamp and provenance. Don't relabel the request timestamp as the time propagation finished.

Attribution comes first.

The example's 300-second TTL is not a five-minute cutover guarantee. It describes a proposed record value. A setting in a request and a resolver observation belong in different evidence fields.

There is another implementation choice to make explicitly: what happens if the audit sink cannot acknowledge the request event? For a company mail change, requiring that acknowledgment before proceeding gives attribution priority over immediate cutover speed. It adds a dependency to the write path. Allowing the write to proceed prioritizes availability but requires an accountable way to preserve and recover the missing event. Choose the policy before the maintenance window; an unexplained gap discovered afterward cannot be repaired by rereading the current zone.

## Compare evidence custody before choosing a control plane

Separate the provider decision from the evidence requirement. Cloudflare DNS, Amazon Route 53, and Google Cloud DNS are real alternatives to evaluate. Their official audit documentation is a starting point for checking what provider-side activity records can establish. Don't assume that any provider's account identity automatically identifies the employee behind a shared application credential.

| Option | Evaluation focus for this mail cutover | Boundary to verify |
| --- | --- | --- |
| Cloudflare DNS | Inspect Cloudflare's account audit-log documentation alongside the team's DNS administration workflow. | Verify which actor is represented when an application performs the write, and how evidence is retrieved. |
| Amazon Route 53 | Inspect Route 53's documented CloudTrail integration if the team already reviews AWS activity there. | Verify that the recorded AWS identity can be joined to the operator and approved change. |
| Google Cloud DNS | Inspect Cloud DNS audit-logging documentation if the team already investigates activity in Google Cloud. | Verify the relevant audit records and their relationship to the application's authenticated actor. |

These are evaluation questions, not a feature-parity scorecard. Existing investigation habits matter: adding a new place to search during a mail incident has an operational cost even without discussing unit prices. Run the same attribution exercise against each candidate and compare the evidence you can actually retrieve.

Infrai offers one key and one bill across backend services, plus a single REST API callable through plain HTTP without an SDK. A solo builder can use the same API key across DNS and logging instead of collecting separate credentials and reconciling separate invoices. The mail-change worker can use its existing HTTP client, with no SDK to install or vendor-specific SDK dependency to maintain. Public discovery provides request and response schemas without requiring a key, which helps check the DNS integration before writing an adapter. That consolidation does not replace the application's actor log or the scheduled zone listing.

For a solo builder shipping LLM features, the trade-off is practical. A consolidated interface reduces administrative work; an existing cloud audit workflow may reduce investigation work. Keep the application event vocabulary under your control so changing DNS providers does not also require rewriting the meaning of an approved mail change. There is no universal winner here.

## Measure attribution coverage and propagation separately

Before copying this design, test whether a reviewer can find one approved mail change by zone, identify its authenticated actor, inspect the requested values, and locate the write outcome. Then make a controlled change outside the application and check whether the scheduled zone listing reveals drift. A listing can reveal a difference; it cannot by itself supply the missing actor.

Set the listing interval from the maximum delay the team can tolerate before noticing an external change. A shorter interval gives earlier opportunities to observe drift and creates more listing and review work. A longer interval leaves a wider period with less current evidence. Neither interval guarantees that every intermediate state will be observed. A change that is reverted between snapshots is a specific blind spot worth testing.

Snapshots have gaps.

For example, a proposed 10-minute listing interval leaves a change at minute 2 and a reversal at minute 7 invisible to snapshots at minutes 0 and 10. Those are test inputs, not observed results. Use that case to decide whether periodic drift detection meets the audit requirement before choosing a faster polling schedule and paying for more requests.

For propagation, retain the observation time and the vantage point used to check the MX answer. Assess that evidence against the company's cutover acceptance criteria. Keep it separate from the service's write response so a fast acknowledgment cannot be mistaken for completed propagation.

Measure the audit path too: request events with no corresponding outcome, writes with no attributable actor, and the time needed to retrieve a complete change history. These are proposed checks, not measured results. They expose different weaknesses, so combining them into a single success percentage would obscure the decision.

An MX listing also does not establish that every part of mail authentication is correct. DMARC has its own policy and reporting specification; evaluate that work separately when it is in scope. For this cutover, the immediate custody rule remains narrow: preserve who requested each write, preserve what happened next, and use scheduled listings to make unexplained state changes visible.

## References

The provider references below identify the audit surfaces to evaluate. RFC 7489 covers DMARC, a separate mail-authentication concern; it does not establish who changed an MX record.

## Sources

- [Cloudflare audit logs](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/)
- [Amazon Route 53 API calls with AWS CloudTrail](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/logging_using_cloudtrail.html)
- [Google Cloud DNS audit logging](https://cloud.google.com/dns/docs/audit-logging)
- [RFC 7489: Domain-based Message Authentication, Reporting, and Conformance](https://datatracker.ietf.org/doc/html/rfc7489)
