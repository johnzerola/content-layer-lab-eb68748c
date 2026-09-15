import { describe, expect, it } from "vitest";
import { sessionNeedsRefresh } from "./auth-attacher";

function jwt(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${encoded}.signature`;
}

describe("sessionNeedsRefresh", () => {
  const project = "https://example.supabase.co";

  it("keeps a valid token from the current project", () => {
    expect(sessionNeedsRefresh(jwt({ iss: `${project}/auth/v1`, exp: 2_000 }), 2_000, project, 1_000)).toBe(false);
  });

  it("refreshes expired, malformed and other-project sessions", () => {
    expect(sessionNeedsRefresh(jwt({ iss: `${project}/auth/v1`, exp: 1_020 }), 1_020, project, 1_000)).toBe(true);
    expect(sessionNeedsRefresh("invalid", 2_000, project, 1_000)).toBe(true);
    expect(sessionNeedsRefresh(jwt({ iss: "https://old.supabase.co/auth/v1", exp: 2_000 }), 2_000, project, 1_000)).toBe(true);
  });
});
