"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  KanbanSquare,
  Building2,
  Layers,
  ClipboardList,
  Factory,
  FileText,
  LayoutDashboard,
  Package,
  Percent,
  Settings,
  LogOut,
  Menu,
  ShoppingBag,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { APP_NAME } from "@/lib/utils/constants";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const MEMBER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/boards", label: "Tarefas", icon: KanbanSquare },
  { href: "/products", label: "Produtos", icon: Package },
  {
    href: "/production/orders",
    label: "Produção",
    icon: ClipboardList,
  },
  {
    href: "/purchasing/orders",
    label: "Pedidos de compra",
    icon: ShoppingCart,
  },
  { href: "/sales/quotes", label: "Orçamentos", icon: FileText },
  { href: "/sales/orders", label: "Pedidos de Venda", icon: ShoppingBag },
  { href: "/settings/profile", label: "Perfil", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/boards", label: "Tarefas", icon: KanbanSquare },
  { href: "/products", label: "Produtos", icon: Package },
  {
    href: "/production/orders",
    label: "Produção",
    icon: ClipboardList,
  },
  {
    href: "/settings/company",
    label: "Configurações da Empresa",
    icon: Building2,
  },
  {
    href: "/settings/work-areas",
    label: "Áreas / centros de custo",
    icon: Layers,
  },
  {
    href: "/settings/work-centers",
    label: "Centros de trabalho",
    icon: Factory,
  },
  {
    href: "/settings/bdi",
    label: "BDI precificação",
    icon: Percent,
  },
  {
    href: "/purchasing/suppliers",
    label: "Fornecedores",
    icon: Truck,
  },
  {
    href: "/purchasing/orders",
    label: "Pedidos de compra",
    icon: ShoppingCart,
  },
  { href: "/sales/quotes", label: "Orçamentos", icon: FileText },
  { href: "/sales/orders", label: "Pedidos de Venda", icon: ShoppingBag },
  { href: "/settings/profile", label: "Perfil", icon: Settings },
];

type AppShellProps = {
  children: ReactNode;
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantRole?: "admin" | "member";
  } | null;
};

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = user?.tenantRole === "admin" ? ADMIN_NAV : MEMBER_NAV;

  async function handleLogout() {
    const supabase = createClient();
    if (!supabase) {
      router.push("/login");
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível sair: " + error.message);
      return;
    }
    toast.success("Você saiu da sessão.");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex bg-slate-50">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white",
          "transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Menu lateral"
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-slate-900"
            onClick={() => setMobileOpen(false)}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-white text-xs font-bold">
              HD
            </span>
            <span>{APP_NAME}</span>
          </Link>
          <button
            type="button"
            className="lg:hidden text-slate-500 hover:text-slate-900"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                  active
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-3 bg-white">
          {user ? (
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
                {(user.fullName || user.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user.fullName || user.email}
                </p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </Button>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-slate-600 hover:text-slate-900"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-medium text-slate-700">
            HD Projetos &amp; Soluções em HVAC
          </h1>
        </header>

        <main className="flex-1 min-w-0 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
