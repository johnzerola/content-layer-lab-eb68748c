import { afterEach, describe, expect, it, vi } from "vitest";
import { persistFacebookPages } from "@/lib/facebook-persistence.server";

const originalEncryptionKey = process.env["SOCIAL_TOKEN_ENCRYPTION_KEY"];

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env["SOCIAL_TOKEN_ENCRYPTION_KEY"];
  else process.env["SOCIAL_TOKEN_ENCRYPTION_KEY"] = originalEncryptionKey;
});

describe("Facebook account persistence", () => {
  it("checks token encryption before creating partial database rows", async () => {
    delete process.env["SOCIAL_TOKEN_ENCRYPTION_KEY"];
    const from = vi.fn();

    await expect(
      persistFacebookPages({ from } as never, {
        userId: "user-1",
        expiresAt: new Date("2026-10-20T00:00:00.000Z"),
        pages: [
          {
            pageId: "page-1",
            name: "Minha Pagina",
            pageAccessToken: "page-token",
            instagram: null,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "SERVER_CONFIG_MISSING" });

    expect(from).not.toHaveBeenCalled();
  });
});
