import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import {
  createCompReport,
  getCompReport,
  getProperty,
  LandPortalError,
  listCompReports,
  searchProperties
} from "./land-portal.js";

type Operations = {
  searchProperties: typeof searchProperties;
  getProperty: typeof getProperty;
  listCompReports: typeof listCompReports;
  getCompReport: typeof getCompReport;
  createCompReport: typeof createCompReport;
};

const defaultOperations: Operations = {
  searchProperties,
  getProperty,
  listCompReports,
  getCompReport,
  createCompReport
};

const security = { securitySchemes: [{ type: "oauth2", scopes: ["landportal.read"] }] };
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function success(label: string, result: unknown) {
  return {
    structuredContent: { result },
    content: [{ type: "text" as const, text: label }]
  };
}

function failure(error: unknown) {
  if (error instanceof LandPortalError) {
    return {
      isError: true,
      structuredContent: { status: error.status, details: error.safeBody ?? null },
      content: [{ type: "text" as const, text: `Land Portal returned HTTP ${error.status}.` }]
    };
  }
  return {
    isError: true,
    content: [{ type: "text" as const, text: "Land Portal did not return a response." }]
  };
}

export function createMcpServer(config: AppConfig, operations: Operations = defaultOperations): McpServer {
  const server = new McpServer({ name: "acre-anthem-land-portal", version: "0.2.0" });

  server.registerTool(
    "connector_status",
    {
      title: "Check Land Portal connector status",
      description: "Verify that the Acre & Anthem connector is online without exposing credentials.",
      inputSchema: {},
      _meta: security,
      annotations: { ...readOnly, openWorldHint: false }
    },
    async () => success("Acre & Anthem Land Portal connector is online.", { ok: true })
  );

  server.registerTool(
    "land_portal_search_properties",
    {
      title: "Search Land Portal properties",
      description:
        "Search Land Portal v2 by parcel number, owner, address, city, ZIP, FIPS, or state. Read-only. A non-empty search consumes search quota; an empty result does not.",
      inputSchema: {
        parcelnumb: z.string().min(1).max(100).optional(),
        owner: z.string().min(1).max(200).optional(),
        address: z.string().min(1).max(250).optional(),
        city: z.string().min(1).max(100).optional(),
        zip: z.string().min(3).max(10).optional(),
        fips: z.string().min(5).max(5).optional(),
        state: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
        includeGeometry: z.boolean().default(false)
      },
      _meta: security,
      annotations: readOnly
    },
    async (input) => {
      if (![input.parcelnumb, input.owner, input.address, input.city, input.zip, input.fips, input.state].some(Boolean)) {
        return { isError: true, content: [{ type: "text", text: "Provide at least one property search field." }] };
      }
      try {
        return success("Land Portal returned the property search results.", await operations.searchProperties(config.landPortal, input));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "land_portal_get_property",
    {
      title: "Get one Land Portal property",
      description:
        "Fetch one property by Land Portal property ID. Read-only, but a successful call consumes single-property quota (or export-row balance after that quota is exhausted).",
      inputSchema: {
        propertyId: z.number().int().positive(),
        fips: z.string().length(5).optional()
      },
      _meta: security,
      annotations: readOnly
    },
    async ({ propertyId, fips }) => {
      try {
        return success("Land Portal returned the property record.", await operations.getProperty(config.landPortal, propertyId, fips));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "land_portal_list_comp_reports",
    {
      title: "List existing Land Portal comp reports",
      description: "List existing comp reports before creating a new one. Listing does not consume comp-report quota.",
      inputSchema: {
        propertyId: z.number().int().positive().optional(),
        status: z.string().min(1).max(50).optional(),
        date: z.string().min(8).max(30).optional(),
        pageSize: z.number().int().min(1).max(50).default(20),
        pageToken: z.string().min(1).max(500).optional()
      },
      _meta: security,
      annotations: readOnly
    },
    async (input) => {
      try {
        return success("Land Portal returned existing comp reports.", await operations.listCompReports(config.landPortal, input));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "land_portal_get_comp_report",
    {
      title: "Get an existing Land Portal comp report",
      description: "Fetch an existing comp report by report ID. This does not consume comp-report quota.",
      inputSchema: { reportId: z.number().int().positive() },
      _meta: security,
      annotations: readOnly
    },
    async ({ reportId }) => {
      try {
        return success("Land Portal returned the comp report.", await operations.getCompReport(config.landPortal, reportId));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "land_portal_create_comp_report",
    {
      title: "Create a Land Portal comp report",
      description:
        "Create an asynchronous comp report for a property ID. This consumes daily comp-report quota. First list existing reports; call only after the user explicitly confirms the quota charge.",
      inputSchema: {
        propertyId: z.number().int().positive(),
        confirmQuotaCharge: z.literal(true).describe("Must be true only after the user explicitly approves consuming comp-report quota")
      },
      _meta: security,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ propertyId }) => {
      try {
        return success("Land Portal accepted the comp report request. Use the returned report ID to check status.", await operations.createCompReport(config.landPortal, propertyId));
      } catch (error) {
        return failure(error);
      }
    }
  );

  return server;
}
