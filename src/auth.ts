import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppConfig } from "./config.js";

function challenge(config: AppConfig): string {
  return `Bearer resource_metadata="${config.mcpPublicUrl}/.well-known/oauth-protected-resource", scope="landportal.read"`;
}

export function protectedResourceMetadata(config: AppConfig) {
  return {
    resource: config.mcpPublicUrl,
    authorization_servers: [config.authIssuer],
    scopes_supported: ["landportal.read"],
    resource_documentation: `${config.mcpPublicUrl}/docs`
  };
}

export function requireOAuth(config: AppConfig) {
  if (config.authDisabled) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const jwks = createRemoteJWKSet(new URL(config.authJwksUri));

  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      res.setHeader("WWW-Authenticate", challenge(config));
      res.status(401).json({ error: "authentication_required" });
      return;
    }

    try {
      const verified = await jwtVerify(token, jwks, {
        issuer: config.authIssuer,
        audience: config.authAudience
      });
      const scope = typeof verified.payload.scope === "string" ? verified.payload.scope.split(" ") : [];
      if (!scope.includes("landportal.read")) {
        res.setHeader("WWW-Authenticate", challenge(config));
        res.status(403).json({ error: "insufficient_scope" });
        return;
      }
      res.locals.auth = { sub: verified.payload.sub };
      next();
    } catch {
      res.setHeader("WWW-Authenticate", challenge(config));
      res.status(401).json({ error: "invalid_token" });
    }
  };
}
