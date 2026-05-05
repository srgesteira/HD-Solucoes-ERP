import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-brand-50 px-4 py-8">
      {children}
    </div>
  );
}
