import { describe, expect, it } from "vitest";
import { facebookCallbackSearch } from "@/lib/facebook-callback";

describe("Facebook callback search", () => {
  it("accepts the numeric error_code parsed by TanStack Router", () => {
    expect(
      facebookCallbackSearch.parse({
        error: "access_denied",
        error_code: 200,
        error_reason: "user_denied",
      }),
    ).toMatchObject({
      error: "access_denied",
      error_code: "200",
      error_reason: "user_denied",
    });
  });

  it("keeps authorization code and state strict strings", () => {
    expect(() => facebookCallbackSearch.parse({ code: 123, state: "signed" })).toThrow();
    expect(() => facebookCallbackSearch.parse({ code: "valid", state: 123 })).toThrow();
  });
});
