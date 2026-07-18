import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { protectedResourceMetadata, requireOAuth } from "./auth.js";
import { createMcpServer } from "./mcp.js";

const config = loadConfig();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "acre-anthem-land-portal-mcp", mode: "read-only" });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  if (config.authDisabled) {
    res.status(404).json({ error: "oauth_disabled_in_local_development" });
    return;
  }
  res.json(protectedResourceMetadata(config));
});

app.get("/docs", (_req, res) => {
  res.type("text/plain").send(
    "Acre & Anthem Land Portal connector. Supports property search, property detail, and comp reports. Skip tracing is not exposed by Land Portal API v2. Credentials stay server-side and are never returned to ChatGPT."
  );
});

type TransportRecord = {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
};
const transports = new Map<string, TransportRecord>();
const oauth = requireOAuth(config);

app.post("/mcp", oauth, async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  let record = sessionId ? transports.get(sessionId) : undefined;

  if (!record && isInitializeRequest(req.body)) {
    const server = createMcpServer(config);
    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id): void => {
        transports.set(id, { transport, server });
      }
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    await server.connect(transport);
    record = { transport, server };
  }

  if (!record) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing MCP session" }, id: null });
    return;
  }

  await record.transport.handleRequest(req, res, req.body);
});

app.get("/mcp", oauth, async (req, res) => {
  const sessionId = req.header("mcp-session-id") ?? "";
  const record = transports.get(sessionId);
  if (!record) {
    res.status(400).send("Invalid or missing MCP session");
    return;
  }
  await record.transport.handleRequest(req, res);
});

app.delete("/mcp", oauth, async (req, res) => {
  const sessionId = req.header("mcp-session-id") ?? "";
  const record = transports.get(sessionId);
  if (!record) {
    res.status(400).send("Invalid or missing MCP session");
    return;
  }
  await record.transport.handleRequest(req, res);
});

app.listen(config.port, "0.0.0.0", () => {
  // Deliberately log no environment variables, URLs with credentials, request headers, or API responses.
  console.log(`Acre & Anthem Land Portal MCP listening on port ${config.port}`);
});
