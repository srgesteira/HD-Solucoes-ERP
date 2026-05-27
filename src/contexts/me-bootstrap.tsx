"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MeResponse } from "@/hooks/use-me";

const MeBootstrapContext = createContext<MeResponse | undefined>(undefined);

export function MeBootstrapProvider({
  value,
  children,
}: {
  value: MeResponse;
  children: ReactNode;
}) {
  return (
    <MeBootstrapContext.Provider value={value}>
      {children}
    </MeBootstrapContext.Provider>
  );
}

export function useMeBootstrap(): MeResponse | undefined {
  return useContext(MeBootstrapContext);
}
