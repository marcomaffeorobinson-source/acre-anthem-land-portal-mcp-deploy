import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const landPortalEnv = {
  LAND_PORTAL_API_KEY: "secret"
};

test("production refuses to start with authentication disabled", () => {
  assert.throws(
    () => loadConfig({ ...landPortalEnv, NODE_ENV: "production", AUTH_DISABLED: "true" }),
    /forbidden/
  );
});

test("local development may use authentication disabled", () => {
  const config = loadConfig({ ...landPortalEnv, NODE_ENV: "development", AUTH_DISABLED: "true" });
  assert.equal(config.authDisabled, true);
  assert.equal(config.landPortal.baseUrl, "https://api.landportal.com");
});
