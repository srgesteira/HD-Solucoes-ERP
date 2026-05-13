"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  KanbanSquare,
  BarChart2,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Calculator,
  DollarSign,
  Factory,
  FileText,
  FileUp,
  LayoutDashboard,
  Layers,
  LineChart,
  Package,
  Percent,
  Settings,
  LogOut,
  Menu,
  PieChart,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Truck,
  User,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { APP_NAME } from "@/lib/utils/constants";
import { usePermissions } from "@/hooks/use-permissions";
import type { ModuleKey } from "@/lib/permissions";

type NavLeaf = {
  title: string;
  href: string;
  icon: LucideIcon;
  module: ModuleKey;
  /** Se definido, basta um dos módulos para mostrar o item. */
  anyOf?: ModuleKey[];
};

type NavGroup = {
  type: "group";
  title: string;
  icon: LucideIcon;
  module: ModuleKey;
  children: NavLeaf[];
};

type NavLink = {
  type: "link";
  title: string;
  href: string;
  icon: LucideIcon;
  module: ModuleKey;
};

type NavEntry = NavGroup | NavLink;

const MENU_STRUCTURE: NavEntry[] = [
  {
    type: "link",
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    module: "dashboard",
  },
  {
    type: "link",
    title: "Tarefas",
    href: "/boards",
    icon: KanbanSquare,
    module: "boards",
  },
  {
    type: "group",
    title: "Financeiro",
    icon: DollarSign,
    module: "finance",
    children: [
      {
        title: "Contas a Receber",
        href: "/finance/receivables",
        icon: DollarSign,
        module: "finance",
      },
      {
        title: "Contas a Pagar",
        href: "/finance/payables",
        icon: Wallet,
        module: "finance",
      },
      {
        title: "Fluxo de Caixa",
        href: "/finance/cash-flow",
        icon: Activity,
        module: "finance",
      },
      {
        title: "Projeção de fluxo",
        href: "/reports/cash-flow",
        icon: BarChart2,
        module: "finance",
        anyOf: ["finance", "reports"],
      },
      {
        title: "Contas vencidas",
        href: "/reports/overdue-receivables",
        icon: AlertTriangle,
        module: "finance",
        anyOf: ["finance", "reports"],
      },
    ],
  },
  {
    type: "group",
    title: "RH",
    icon: Users,
    module: "hr",
    children: [
      {
        title: "Colaboradores",
        href: "/hr/employees",
        icon: Users,
        module: "hr",
      },
    ],
  },
  {
    type: "group",
    title: "Produção",
    icon: Factory,
    module: "production",
    children: [
      {
        title: "Linhas de produção",
        href: "/production/lines",
        icon: Factory,
        module: "production",
      },
      {
        title: "Ordens de produção",
        href: "/production/orders",
        icon: Package,
        module: "production",
      },
      {
        title: "MRP",
        href: "/mrp",
        icon: Boxes,
        module: "mrp",
      },
      {
        title: "Custo de mão de obra",
        href: "/reports/labor-cost",
        icon: Calculator,
        module: "production",
        anyOf: ["production", "reports"],
      },
      {
        title: "Atraso na produção",
        href: "/reports/production-delay",
        icon: Clock,
        module: "production",
        anyOf: ["production", "reports"],
      },
    ],
  },
  {
    type: "group",
    title: "Compras",
    icon: ShoppingCart,
    module: "purchasing",
    children: [
      {
        title: "Fornecedores",
        href: "/purchasing/suppliers",
        icon: Truck,
        module: "purchasing",
      },
      {
        title: "Pedidos de compra",
        href: "/purchasing/orders",
        icon: ShoppingCart,
        module: "purchasing",
      },
    ],
  },
  {
    type: "group",
    title: "Vendas",
    icon: DollarSign,
    module: "sales",
    children: [
      {
        title: "Orçamentos",
        href: "/sales/quotes",
        icon: FileText,
        module: "sales",
      },
      {
        title: "Pedidos de venda",
        href: "/sales/orders",
        icon: ShoppingBag,
        module: "sales",
      },
      {
        title: "Importar PDF (orçamento)",
        href: "/sales/upload-pdf",
        icon: FileUp,
        module: "sales",
      },
      {
        title: "Produtos mais vendidos",
        href: "/reports/top-products",
        icon: LineChart,
        module: "sales",
        anyOf: ["sales", "reports"],
      },
      {
        title: "Conversão de orçamentos",
        href: "/reports/quotes-conversion",
        icon: PieChart,
        module: "sales",
        anyOf: ["sales", "reports"],
      },
    ],
  },
  {
    type: "group",
    title: "Produtos",
    icon: Package,
    module: "products",
    children: [
      {
        title: "Cadastro",
        href: "/products",
        icon: Package,
        module: "products",
      },
      {
        title: "Estoque",
        href: "/inventory",
        icon: Warehouse,
        module: "inventory",
      },
      {
        title: "Classificação técnica",
        href: "/settings/product-families",
        icon: Tags,
        module: "products",
      },
    ],
  },
  {
    type: "group",
    title: "Configurações",
    icon: Settings,
    module: "settings",
    children: [
      {
        title: "Empresa",
        href: "/settings/company",
        icon: Building2,
        module: "settings",
      },
      {
        title: "Áreas / centros de custo",
        href: "/settings/work-areas",
        icon: Layers,
        module: "settings",
      },
      {
        title: "Centros de trabalho",
        href: "/settings/work-centers",
        icon: Factory,
        module: "settings",
      },
      {
        title: "BDI precificação",
        href: "/settings/bdi",
        icon: Percent,
        module: "settings",
      },
      {
        title: "Utilizadores",
        href: "/settings/users",
        icon: Users,
        module: "settings",
      },
      {
        title: "Perfil",
        href: "/settings/profile",
        icon: User,
        module: "settings",
      },
    ],
  },
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

function navItemVisible(
  leaf: { module: ModuleKey; anyOf?: ModuleKey[] },
  can: (m: ModuleKey) => boolean
): boolean {
  if (leaf.anyOf?.length) return leaf.anyOf.some((m) => can(m));
  return can(leaf.module);
}

function pathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { can } = usePermissions();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const e of MENU_STRUCTURE) {
      if (e.type === "group") o[e.title] = true;
    }
    return o;
  });

  const visibleMenu = useMemo(() => {
    const out: NavEntry[] = [];
    for (const e of MENU_STRUCTURE) {
      if (e.type === "link") {
        if (navItemVisible(e, can)) out.push(e);
        continue;
      }
      const children = e.children.filter((c) => navItemVisible(c, can));
      if (children.length === 0) continue;
      out.push({ ...e, children });
    }
    return out;
  }, [can]);

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

  function toggleGroup(title: string) {
    setOpenGroups((s) => ({ ...s, [title]: !s[title] }));
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

        <nav className="p-3 flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {visibleMenu.map((entry) => {
            if (entry.type === "link") {
              const Icon = entry.icon;
              const active = pathActive(pathname, entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                    active
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{entry.title}</span>
                </Link>
              );
            }

            const open = openGroups[entry.title] !== false;
            const anyChildActive = entry.children.some((c) =>
              pathActive(pathname, c.href)
            );
            const GroupIcon = entry.icon;

            return (
              <div key={entry.title} className="rounded-md">
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.title)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left",
                    anyChildActive
                      ? "bg-slate-100 text-slate-900 font-medium"
                      : "text-slate-800 hover:bg-slate-50"
                  )}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{entry.title}</span>
                </button>
                {open ? (
                  <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                    {entry.children.map((c) => {
                      const CIcon = c.icon;
                      const active = pathActive(pathname, c.href);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                            active
                              ? "bg-brand-50 text-brand-700 font-medium"
                              : "text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          <CIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>{c.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
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
