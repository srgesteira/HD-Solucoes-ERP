import type { SupabaseClient } from "@supabase/supabase-js";
import { buildActivationLink } from "@/shared/auth/activation-link";

type LinkType = "invite" | "recovery";

export async function generateActivationLinkForEmail(
  admin: SupabaseClient,
  params: {
    email: string;
    origin: string;
    redirectTo: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ activation_link: string; link_type: LinkType }> {
  const { email, origin, redirectTo, metadata } = params;

  const invite = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo, data: metadata },
  });

  if (!invite.error && invite.data?.properties?.hashed_token) {
    return {
      link_type: "invite",
      activation_link: buildActivationLink(
        origin,
        invite.data.properties.hashed_token,
        "invite"
      ),
    };
  }

  const recovery = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  const hashedToken = recovery.data?.properties?.hashed_token;
  if (recovery.error || !hashedToken) {
    throw new Error(
      recovery.error?.message ?? invite.error?.message ?? "Erro ao gerar link."
    );
  }

  return {
    link_type: "recovery",
    activation_link: buildActivationLink(origin, hashedToken, "recovery"),
  };
}
