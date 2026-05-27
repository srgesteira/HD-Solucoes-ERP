"use client";

import { useCallback, useMemo } from "react";
import { useMe } from "@/hooks/use-me";
import {
  DEFAULT_MODULE_PERMISSIONS,
  type ModuleKey,
  type ModulePermissions,
} from "@/shared/auth/permissions";
import {
  applyEnabledModulesToLegacyPermissions,
  userHasModule,
} from "@/shared/auth/menu-modules";

export function usePermissions(): {
  permissions: ModulePermissions;
  can: (module: ModuleKey) => boolean;
  canMenu: (menuModuleKey: string) => boolean;
  isLoading: boolean;
} {
  const { data: me, isLoading } = useMe();

  const permissions = useMemo(() => {
    const base: ModulePermissions = {
      ...DEFAULT_MODULE_PERMISSIONS,
      ...(me?.permissions ?? {}),
    };
    if (!me) return base;
    return applyEnabledModulesToLegacyPermissions(
      base,
      me.enabled_modules,
      me.role
    );
  }, [me]);

  const can = useCallback(
    (module: ModuleKey) => permissions[module] === true,
    [permissions]
  );

  const canMenu = useCallback(
    (menuModuleKey: string) => {
      if (!me) return false;
      if (me.role === "admin") return true;
      if (me.enabled_modules?.length) {
        return userHasModule(
          { role: me.role, enabled_modules: me.enabled_modules },
          menuModuleKey
        );
      }
      return can(
        ({
          vendas: "sales",
          compras: "purchasing",
          faturamento: "finance",
          engenharia: "engineering",
          pcp: "mrp",
          almoxarifado: "inventory",
          expedicao: "logistics",
          producao: "production",
          qualidade: "quality",
          rh: "hr",
          boards: "boards",
          core: "settings",
        } as Record<string, ModuleKey>)[menuModuleKey] ?? "dashboard"
      );
    },
    [me, can]
  );

  return { permissions, can, canMenu, isLoading };
}
