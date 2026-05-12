"use client";

import { useQuery } from "@tanstack/react-query";
import type { ModulePermissions } from "@/lib/permissions";

export type MeResponse = {
  id: string;
  role: "admin" | "member";
  permissions: ModulePermissions;
};

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch("/api/me", { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Sessão inválida");
  }
  return res.json() as Promise<MeResponse>;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  });
}
