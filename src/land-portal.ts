import type { AppConfig } from "./config.js";

export type PropertySearch = {
  parcelnumb?: string;
  owner?: string;
  address?: string;
  city?: string;
  zip?: string;
  fips?: string;
  state?: string;
  includeGeometry?: boolean;
};

export type CompReportList = {
  propertyId?: number;
  status?: string;
  date?: string;
  pageSize?: number;
  pageToken?: string;
};

export class LandPortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly safeBody?: unknown
  ) {
    super(message);
  }
}

async function request(
  config: AppConfig["landPortal"],
  path: string,
  options: { method?: "GET" | "POST"; query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const url = new URL(path, `${config.baseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetchImpl(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(20_000)
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const safeBody = response.status < 500 ? body : undefined;
    throw new LandPortalError(`Land Portal returned HTTP ${response.status}`, response.status, safeBody);
  }
  return body;
}

export function searchProperties(
  config: AppConfig["landPortal"],
  input: PropertySearch,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return request(config, "/v2/properties", {
    query: {
      parcelnumb: input.parcelnumb,
      owner: input.owner,
      address: input.address,
      city: input.city,
      zip: input.zip,
      fips: input.fips,
      state: input.state,
      include_geometry: input.includeGeometry
    }
  }, fetchImpl);
}

export function getProperty(
  config: AppConfig["landPortal"],
  propertyId: number,
  fips?: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return request(config, `/v2/properties/${propertyId}`, { query: { fips } }, fetchImpl);
}

export function listCompReports(
  config: AppConfig["landPortal"],
  input: CompReportList,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return request(config, "/v2/reports/comps", {
    query: {
      property_id: input.propertyId,
      status: input.status,
      date: input.date,
      page_size: input.pageSize,
      page_token: input.pageToken
    }
  }, fetchImpl);
}

export function getCompReport(
  config: AppConfig["landPortal"],
  reportId: number,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return request(config, `/v2/reports/comps/${reportId}`, {}, fetchImpl);
}

export function createCompReport(
  config: AppConfig["landPortal"],
  propertyId: number,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return request(config, "/v2/reports/comps", { method: "POST", body: { property_id: propertyId } }, fetchImpl);
}
