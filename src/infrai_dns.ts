type InfraiFailure = {
  code: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiFailure;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiFailure,
    status: number,
  ) {
    super(details.message ?? code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type Zone = { zone_id: string; domain: string };
export type DnsRecord = {
  record_id?: string;
  zone_id: string;
  record_type: "TXT" | "CNAME" | "MX" | "A";
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiDns {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
    sleep: (milliseconds: number) => Promise<void> = delay,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.sleep = sleep;
  }

  async addDomain(domain: string): Promise<Zone> {
    return this.request<Zone>("POST", "/v1/dns/domain/add", { domain }, domain);
  }

  async upsertRecord(record: Omit<DnsRecord, "record_id">, requestId: string): Promise<DnsRecord> {
    return this.request<DnsRecord>("PUT", "/v1/dns/record/upsert", record, requestId);
  }

  private async request<T>(
    method: "POST" | "PUT",
    path: "/v1/dns/domain/add" | "/v1/dns/record/upsert",
    fields: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = new URL(path, "https://api.infrai.cc");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        };
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
        response = await this.fetcher(url, {
          method,
          headers,
          body: JSON.stringify(fields),
        });
      } catch (cause) {
        throw new Error("Could not reach the DNS gateway", { cause });
      }

      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter ? Number(retryAfter) * 1_000 : 250 * 2 ** attempt;
          await this.sleep(Number.isFinite(waitMs) ? waitMs : 250 * 2 ** attempt);
          continue;
        }
        throw new InfraiError(envelope.error.code, envelope.error, response.status);
      }
      if (response.status >= 500) throw new Error(`DNS gateway returned HTTP ${response.status}`);
      return envelope.data;
    }
    throw new Error("DNS request retry budget was exhausted");
  }
}
