import { z } from "zod";
import type { FacebookPage } from "@/lib/facebook-oauth.server";
import { decryptSocialToken, encryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError } from "@/lib/social-linking.server";

const SELECTION_TTL_MS = 15 * 60 * 1000;

const pageSchema = z.object({
  pageId: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(200),
  pageAccessToken: z.string().min(1).max(8192),
  instagram: z
    .object({
      id: z.string().regex(/^\d+$/),
      username: z.string().min(1).max(100),
    })
    .nullable(),
});

const selectionSchema = z.object({
  version: z.literal(1),
  userId: z.string().min(1).max(200),
  expiresAt: z.string().datetime(),
  tokenExpiresAt: z.string().datetime(),
  pages: z.array(pageSchema).min(1).max(200),
});

export type MetaSelectionCandidate = {
  key: string;
  platform: "facebook" | "instagram";
  providerAccountId: string;
  username: string;
  displayName: string;
  linkedPageName: string | null;
};

export type MetaSelectionPayload = z.infer<typeof selectionSchema>;

export function metaChannelKey(
  platform: "facebook" | "instagram",
  providerAccountId: string,
): string {
  return `${platform}:${providerAccountId}`;
}

export function metaSelectionCandidates(pages: FacebookPage[]): MetaSelectionCandidate[] {
  const candidates = pages.flatMap((page) => {
    const facebook: MetaSelectionCandidate = {
      key: metaChannelKey("facebook", page.pageId),
      platform: "facebook",
      providerAccountId: page.pageId,
      username: page.pageId,
      displayName: page.name,
      linkedPageName: null,
    };
    const instagram = page.instagram
      ? [
          {
            key: metaChannelKey("instagram", page.instagram.id),
            platform: "instagram" as const,
            providerAccountId: page.instagram.id,
            username: page.instagram.username,
            displayName: `@${page.instagram.username}`,
            linkedPageName: page.name,
          },
        ]
      : [];
    return [facebook, ...instagram];
  });
  return [...new Map(candidates.map((candidate) => [candidate.key, candidate])).values()];
}

export function createMetaSelection(input: {
  userId: string;
  pages: FacebookPage[];
  tokenExpiresAt: Date;
  now?: number;
  environment?: NodeJS.ProcessEnv;
}): { selectionToken: string; candidates: MetaSelectionCandidate[] } {
  const now = input.now ?? Date.now();
  const expiresAt = new Date(
    Math.min(now + SELECTION_TTL_MS, input.tokenExpiresAt.getTime()),
  ).toISOString();
  const payload: MetaSelectionPayload = {
    version: 1,
    userId: input.userId,
    expiresAt,
    tokenExpiresAt: input.tokenExpiresAt.toISOString(),
    pages: input.pages,
  };
  return {
    selectionToken: encryptSocialToken(JSON.stringify(payload), input.environment),
    candidates: metaSelectionCandidates(input.pages),
  };
}

export function openMetaSelection(input: {
  selectionToken: string;
  userId: string;
  now?: number;
  environment?: NodeJS.ProcessEnv;
}): MetaSelectionPayload {
  try {
    const decoded = decryptSocialToken(input.selectionToken, input.environment);
    const payload = selectionSchema.parse(JSON.parse(decoded));
    if (payload.userId !== input.userId) {
      throw new MetaLinkError(
        "ACCOUNT_OWNERSHIP_INVALID",
        "Esta seleção pertence a outro usuário.",
      );
    }
    if (new Date(payload.expiresAt).getTime() <= (input.now ?? Date.now())) {
      throw new MetaLinkError("META_AUTH_INVALID", "A seleção expirou. Autorize a Meta novamente.");
    }
    return payload;
  } catch (error) {
    if (error instanceof MetaLinkError) throw error;
    throw new MetaLinkError("META_AUTH_INVALID", "A seleção de contas é inválida ou expirou.");
  }
}
