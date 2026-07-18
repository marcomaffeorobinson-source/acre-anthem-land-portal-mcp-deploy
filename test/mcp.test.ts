import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AppConfig } from "../src/config.js";
import { createMcpServer } from "../src/mcp.js";

const config: AppConfig = {
  port: 2091,
  production: false,
  authDisabled: true,
  mcpPublicUrl: "http://127.0.0.1:2091",
  authIssuer: "",
  authAudience: "",
  authJwksUri: "",
  landPortal: { baseUrl: "https://api.landportal.com", apiKey: "secret-never-return" }
};

test("MCP exposes read tools and a separately confirmed quota-consuming comp tool", async (t) => {
  const calls: string[] = [];
  const operations = {
    searchProperties: async () => (calls.push("search"), { data: [] }),
    getProperty: async () => (calls.push("property"), { data: { property_id: 42 } }),
    listCompReports: async () => (calls.push("list-comps"), { data: [] }),
    getCompReport: async () => (calls.push("get-comp"), { data: { id: 9 } }),
    createCompReport: async () => (calls.push("create-comp"), { data: { id: 10 } })
  } as Parameters<typeof createMcpServer>[1];
  const server = createMcpServer(config, operations);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  t.after(async () => { await client.close(); await server.close(); });

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
    "connector_status",
    "land_portal_create_comp_report",
    "land_portal_get_comp_report",
    "land_portal_get_property",
    "land_portal_list_comp_reports",
    "land_portal_search_properties"
  ]);
  assert.equal(tools.tools.find((tool) => tool.name === "land_portal_create_comp_report")?.annotations?.readOnlyHint, false);
  assert.ok(tools.tools.filter((tool) => tool.name !== "land_portal_create_comp_report").every((tool) => tool.annotations?.readOnlyHint === true));

  const search = await client.callTool({
    name: "land_portal_search_properties",
    arguments: { parcelnumb: "123-ABC", state: "tn" }
  });
  assert.equal(search.isError, undefined);
  assert.deepEqual(calls, ["search"]);
  assert.equal(JSON.stringify(search).includes(config.landPortal.apiKey), false);

  const missingConfirmation = await client.callTool({
    name: "land_portal_create_comp_report",
    arguments: { propertyId: 42 }
  });
  assert.equal(missingConfirmation.isError, true);
  assert.deepEqual(calls, ["search"]);

  await client.callTool({
    name: "land_portal_create_comp_report",
    arguments: { propertyId: 42, confirmQuotaCharge: true }
  });
  assert.deepEqual(calls, ["search", "create-comp"]);
});
