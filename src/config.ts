import "dotenv/config";

export type AppConfig = {
  port: number;
  production: boolean;
  authDisabled: boolean;
  mcpPublicUrl: string;
  authIssuer: string;
  authAudience: string;
  authJwksUri: string;
  landPortal: {
    baseUrl: string;
    apiKey: string;
  };
};

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

function normalizedIssuer(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const authDisabled = env.AUTH_DISABLED === "true";

  if (production && authDisabled) {
    throw new Error("AUTH_DISABLED=true is forbidden when NODE_ENV=production");
  }

  const authIssuer = authDisabled ? "" : normalizedIssuer(required("AUTH_ISSUER", env.AUTH_ISSUER));
  const mcpPublicUrl = authDisabled
    ? (env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${env.PORT ?? "2091"}`)
    : required("MCP_PUBLIC_URL", env.MCP_PUBLIC_URL).replace(/\/$/, "");

  return {
    port: Number(env.PORT ?? "2091"),
    production,
    authDisabled,
    mcpPublicUrl,
    authIssuer,
    authAudience: authDisabled ? "" : required("AUTH_AUDIENCE", env.AUTH_AUDIENCE),
    authJwksUri: authDisabled
      ? ""
      : (env.AUTH_JWKS_URI?.trim() || new URL(".well-known/jwks.json", authIssuer).toString()),
    landPortal: {
      baseUrl: (env.LAND_PORTAL_BASE_URL?.trim() || "https://api.landportal.com").replace(/\/$/, ""),
      apiKey: required("LAND_PORTAL_API_KEY", env.LAND_PORTAL_API_KEY)
    }
  };
}
