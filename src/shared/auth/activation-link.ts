export type ActivationLinkType = "invite" | "recovery";

/** Link interno: o token só é consumido no POST /activate (evita prefetch de chat/e-mail). */
export function buildActivationLink(
  origin: string,
  hashedToken: string,
  type: ActivationLinkType = "invite"
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
  });
  return `${origin.replace(/\/$/, "")}/activate?${params.toString()}`;
}

/** @deprecated Use buildActivationLink */
export function buildInviteActivationLink(
  origin: string,
  hashedToken: string
): string {
  return buildActivationLink(origin, hashedToken, "invite");
}
