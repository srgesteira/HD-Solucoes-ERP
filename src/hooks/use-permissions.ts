"use client";

import { useMemo } from "react";
import { useMe } from "@/hooks/use-me";
import {
  DEFAULT_MODULE_PERMISSIONS,
  type ModuleKey,
  type ModulePermissions,
} from "@/lib/permissions";

export function usePermissions(): {
  permissions: ModulePermissions;
  can: (module: ModuleKey) => boolean;
  isLoading: boolean;
} {
  const { data: me, isLoading } = useMe();

  const permissions = useMemo(
    () => ({
      ...DEFAULT_MODULE_PERMISSIONS,
      ...(me?.permissions ?? {}),
    }),
    [me?.permissions]
  );

  const can = useMemo(
    () => (module: ModuleKey) => permissions[module] === true,
    [permissions]
  );

  return { permissions, can, isLoading };
}
