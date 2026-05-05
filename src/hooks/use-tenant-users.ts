"use client";

import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@/lib/types/kanban";

export const TENANT_USERS_KEY = ["tenant-users"] as const;

async function fetchTenantUsers(): Promise<UserProfile[]> {
  const res = await fetch("/api/tenant/users", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao listar utilizadores");
  }
  const data = (await res.json()) as { users: UserProfile[] };
  return data.users;
}

export function useTenantUsers() {
  return useQuery({
    queryKey: TENANT_USERS_KEY,
    queryFn: fetchTenantUsers,
    staleTime: 60_000,
  });
}
