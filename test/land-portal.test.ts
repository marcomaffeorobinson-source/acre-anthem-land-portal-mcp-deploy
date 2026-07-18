import assert from "node:assert/strict";
import test from "node:test";
import { createCompReport, getCompReport, getProperty, listCompReports, searchProperties } from "../src/land-portal.js";

const config = { baseUrl: "https://api.landportal.com", apiKey: "test-secret-never-log" };

function recorder(body: unknown = { data: [] }) {
  const calls: Array<{ url: string; method: string; auth: string; body?: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("authorization") ?? "",
      body: typeof init?.body === "string" ? init.body : undefined
    });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

test("uses exact Land Portal v2 property routes and bearer authentication", async () => {
  const observed = recorder();
  await searchProperties(config, { parcelnumb: "123-ABC", state: "TN" }, observed.fetchImpl);
  await getProperty(config, 42, "47031", observed.fetchImpl);

  assert.equal(observed.calls[0]!.method, "GET");
  assert.equal(observed.calls[0]!.auth, `Bearer ${config.apiKey}`);
  assert.equal(observed.calls[0]!.url, "https://api.landportal.com/v2/properties?parcelnumb=123-ABC&state=TN");
  assert.equal(observed.calls[1]!.url, "https://api.landportal.com/v2/properties/42?fips=47031");
  assert.equal(JSON.stringify(observed.calls).includes(config.apiKey), true);
});

test("lists and fetches comp reports with GET, and creates only with POST", async () => {
  const observed = recorder({ data: { id: 9 } });
  await listCompReports(config, { propertyId: 42, pageSize: 20 }, observed.fetchImpl);
  await getCompReport(config, 9, observed.fetchImpl);
  const result = await createCompReport(config, 42, observed.fetchImpl);

  assert.equal(observed.calls[0]!.url, "https://api.landportal.com/v2/reports/comps?property_id=42&page_size=20");
  assert.equal(observed.calls[0]!.method, "GET");
  assert.equal(observed.calls[1]!.url, "https://api.landportal.com/v2/reports/comps/9");
  assert.equal(observed.calls[1]!.method, "GET");
  assert.equal(observed.calls[2]!.method, "POST");
  assert.equal(observed.calls[2]!.body, JSON.stringify({ property_id: 42 }));
  assert.equal(JSON.stringify(result).includes(config.apiKey), false);
});
