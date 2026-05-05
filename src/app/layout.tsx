import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "ERP HD Soluções Industriais",
    template: "%s · ERP HD",
  },
  description:
    "Sistema corporativo da HD Projetos & Soluções em HVAC. Módulo 1: Agendador de Tarefas (Kanban).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen min-h-[100dvh] overflow-x-hidden bg-slate-50 antialiased text-slate-900">
        <Toaster position="top-center" richColors closeButton />
        {children}
      </body>
    </html>
  );
}
