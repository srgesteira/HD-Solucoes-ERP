/** Link interno: o token só é consumido no POST /activate (evita prefetch de chat/e-mail). */
export function buildInviteActivationLink(
  origin: string,
  hashedToken: string
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: "invite",
  });
  return `${origin.replace(/\/$/, "")}/activate?${params.toString()}`;
}
