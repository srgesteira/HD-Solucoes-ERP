"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  Building2,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cog,
  DollarSign,
  Factory,
  FileText,
  FileUp,
  KanbanSquare,
  LayoutDashboard,
  Layers,
  LineChart,
  LogOut,
  Menu,
  Package,
  Percent,
  PieChart,
  Receipt,
  Rocket,
  RotateCcw,
  Send,
  Scale,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Truck,
  User,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/db/supabase/client";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import { APP_NAME } from "@/shared/utils/constants";
import { usePermissions } from "@/hooks/use-permissions";
import type { ModuleKey } from "@/shared/auth/permissions";
import { fetchProductionLines } from "@/modules/producao/lib/production/production-lines-api";
import {
  alertEntryForHref,
  useMenuAlerts,
} from "@/hooks/use-menu-alerts";
import {
  groupAlertTotal,
  type MenuAlertEntry,
  type MenuAlertLevel,
} from "@/modules/core/lib/navigation/menu-alerts";

const PRODUCTION_MENU_TITLE = "Produção";
const LOADING_LINES_NAV_HREF = "__loading_lines__";

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
  anyOf?: ModuleKey[];
};

type NavEntry = NavGroup | NavLink;

const MENU_STRUCTURE: NavEntry[] = [
  {
    type: "link",
    title: "Portal",
    href: "/home",
    icon: LayoutDashboard,
    module: "dashboard",
  },
  {
    type: "link",
    title: "Dashboard Gerencial",
    href: "/dashboard-gerencial",
    icon: BarChart2,
    module: "dashboard",
    anyOf: ["reports", "finance"],
  },
  {
    type: "link",
    title: "Dashboard BI",
    href: "/dashboard",
    icon: LineChart,
    module: "dashboard",
    anyOf: ["reports", "finance"],
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
    title: "Logística",
    icon: Truck,
    module: "logistics",
    children: [
      {
        title: "PCP",
        href: "/logistics/pcp",
        icon: CalendarDays,
        module: "logistics",
        anyOf: ["logistics", "mrp", "production"],
      },
      {
        title: "Compras",
        href: "/purchasing/orders",
        icon: ShoppingCart,
        module: "logistics",
        anyOf: ["logistics", "purchasing"],
      },
      {
        title: "Devoluções de compra",
        href: "/purchasing/returns",
        icon: RotateCcw,
        module: "logistics",
        anyOf: ["logistics", "purchasing"],
      },
      {
        title: "Fornecedores",
        href: "/purchasing/suppliers",
        icon: Users,
        module: "logistics",
        anyOf: ["logistics", "purchasing"],
      },
      {
        title: "Almoxarifado",
        href: "/logistics/warehouse",
        icon: Warehouse,
        module: "logistics",
        anyOf: ["logistics", "inventory"],
      },
      {
        title: "Expedição",
        href: "/logistics/shipping",
        icon: Send,
        module: "logistics",
      },
      {
        title: "Relatórios logísticos",
        href: "/logistics/reports",
        icon: BarChart2,
        module: "logistics",
        anyOf: ["logistics", "reports"],
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
        title: "Controle de qualidade (CQ)",
        href: "/production/quality-control",
        icon: ClipboardCheck,
        module: "production",
        anyOf: ["production", "quality"],
      },
      {
        title: "KPIs de produção",
        href: "/production/dashboard",
        icon: LayoutDashboard,
        module: "production",
      },
    ],
  },
  {
    type: "group",
    title: "Qualidade",
    icon: ClipboardCheck,
    module: "quality",
    children: [
      {
        title: "Inspeção de recebimento",
        href: "/quality/inspection-receiving",
        icon: Package,
        module: "quality",
      },
      {
        title: "Inspeção em processo",
        href: "/quality/inspection-in-process",
        icon: Wrench,
        module: "quality",
      },
      {
        title: "Controle final (liberação)",
        href: "/quality/final-release",
        icon: ClipboardCheck,
        module: "quality",
      },
      {
        title: "Não conformidades",
        href: "/quality/non-conformities",
        icon: AlertTriangle,
        module: "quality",
      },
    ],
  },
  {
    type: "group",
    title: "Engenharia",
    icon: Cog,
    module: "engineering",
    children: [
      {
        title: "Inbox estrutura",
        href: "/engineering/inbox",
        icon: Layers,
        module: "engineering",
        anyOf: ["engineering", "products"],
      },
      {
        title: "Produtos",
        href: "/products",
        icon: Package,
        module: "engineering",
        anyOf: ["engineering", "products"],
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
      {
        title: "Departamentos",
        href: "/hr/departments",
        icon: Building2,
        module: "hr",
      },
      {
        title: "Cargos e salários",
        href: "/hr/positions",
        icon: UserCog,
        module: "hr",
      },
      {
        title: "Treinamentos",
        href: "/hr/training",
        icon: BookOpen,
        module: "hr",
      },
      {
        title: "Turnover",
        href: "/hr/turnover",
        icon: PieChart,
        module: "hr",
      },
      {
        title: "Custos de MO",
        href: "/finance/cost-dashboard",
        icon: Calculator,
        module: "hr",
        anyOf: ["finance", "production", "reports", "hr"],
      },
    ],
  },
  {
    type: "group",
    title: "Faturamento",
    icon: Receipt,
    module: "finance",
    children: [
      {
        title: "Faturamento fiscal",
        href: "/faturamento/fiscal",
        icon: Receipt,
        module: "finance",
      },
      {
        title: "Análise de crédito",
        href: "/finance/credit-analysis",
        icon: ClipboardCheck,
        module: "finance",
      },
      {
        title: "Dashboard",
        href: "/finance/dashboard",
        icon: LayoutDashboard,
        module: "finance",
        anyOf: ["finance", "reports"],
      },
    ],
  },
  {
    type: "group",
    title: "Financeiro",
    icon: DollarSign,
    module: "finance",
    children: [
      {
        title: "Contas",
        href: "/finance/contas",
        icon: Wallet,
        module: "finance",
      },
      {
        title: "Conciliação bancária",
        href: "/finance/bank-reconciliation",
        icon: Activity,
        module: "finance",
      },
      {
        title: "Fluxo de Caixa",
        href: "/finance/cash-flow",
        icon: Activity,
        module: "finance",
      },
    ],
  },
  {
    type: "group",
    title: "Vendas",
    icon: ShoppingBag,
    module: "sales",
    children: [
      {
        title: "Dashboard",
        href: "/sales/dashboard",
        icon: LayoutDashboard,
        module: "sales",
      },
      {
        title: "Orçamentos",
        href: "/sales/quotes",
        icon: FileText,
        module: "sales",
      },
      {
        title: "Clientes",
        href: "/customers",
        icon: User,
        module: "sales",
      },
      {
        title: "Pedidos de venda",
        href: "/sales/orders",
        icon: ShoppingBag,
        module: "sales",
      },
      {
        title: "Devoluções de venda",
        href: "/sales/returns",
        icon: RotateCcw,
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
    type: "link",
    title: "Saúde do dado",
    href: "/data-health",
    icon: Activity,
    module: "dashboard",
  },
  {
    type: "link",
    title: "Onboarding",
    href: "/onboarding",
    icon: Rocket,
    module: "settings",
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
        title: "Classificação técnica",
        href: "/settings/product-families",
        icon: Tags,
        module: "settings",
        anyOf: ["settings", "products", "engineering"],
      },
      {
        title: "BDI precificação",
        href: "/settings/bdi",
        icon: Percent,
        module: "settings",
      },
      {
        title: "Regras fiscais",
        href: "/settings/fiscal-rules",
        icon: Scale,
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

/**
 * Destaque visual por nível de urgência (§11.3).
 * - urgent: vermelho com pulse — vence hoje, atrasado, NF-e em erro.
 * - attention: âmbar estático — pendente mas com folga.
 * - info: cinza neutro — apenas contagem informativa.
 */
function menuOpenActivityClass(
  level: MenuAlertLevel | undefined,
  active: boolean
): string {
  if (!level || active) return "";
  switch (level) {
    case "urgent":
      return "animate-pulse font-semibold text-red-700";
    case "attention":
      return "font-semibold text-amber-800";
    case "info":
      return "text-slate-600";
    default:
      return "";
  }
}

function badgeClassForLevel(level: MenuAlertLevel): string {
  switch (level) {
    case "urgent":
      return "bg-red-100 text-red-800 border border-red-200";
    case "attention":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "info":
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

/** Resumo "X coisas urgentes hoje" exibido no topo do menu (§11.3). */
function UrgentAlertsSummary({
  alerts,
}: {
  alerts: Record<string, MenuAlertEntry> | undefined;
}) {
  if (!alerts) return null;
  let urgentCount = 0;
  for (const e of Object.values(alerts)) {
    if (e.level === "urgent") urgentCount += e.count;
  }
  if (urgentCount <= 0) return null;
  return (
    <div className="mx-3 mt-3 mb-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 animate-pulse">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
        {urgentCount === 1
          ? "1 coisa urgente hoje"
          : `${urgentCount} coisas urgentes hoje`}
      </span>
    </div>
  );
}

function MenuItemLabel({
  title,
  entry,
}: {
  title: string;
  entry: MenuAlertEntry | undefined;
}) {
  return (
    <>
      <span className="truncate">{title}</span>
      {entry && entry.count > 0 ? (
        <span
          className={cn(
            "ml-auto inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none min-w-[20px]",
            badgeClassForLevel(entry.level)
          )}
        >
          {entry.count}
        </span>
      ) : null}
    </>
  );
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { can } = usePermissions();
  const canSeeProduction = can("production");

  const productionLinesQ = useQuery({
    queryKey: ["production-lines-nav"],
    queryFn: fetchProductionLines,
    enabled: Boolean(user) && canSeeProduction,
    staleTime: 5 * 60 * 1000,
  });

  const menuAlertsQ = useMenuAlerts();
  const menuAlerts = menuAlertsQ.data;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const e of MENU_STRUCTURE) {
      if (e.type === "group") o[e.title] = false;
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
      let children = e.children.filter((c) => navItemVisible(c, can));

      if (e.title === PRODUCTION_MENU_TITLE && canSeeProduction) {
        const lineNav: NavLeaf[] = productionLinesQ.isLoading
          ? [
              {
                title: "Carregando linhas…",
                href: LOADING_LINES_NAV_HREF,
                icon: Factory,
                module: "production",
              },
            ]
          : (productionLinesQ.data ?? []).map((line) => ({
              title: `${line.code} - ${line.name}`,
              href: `/production/lines/${line.id}`,
              icon: Factory,
              module: "production" as const,
            }));
        children = [...lineNav, ...children];
      }

      if (children.length === 0) continue;
      out.push({ ...e, children });
    }
    return out;
  }, [can, canSeeProduction, productionLinesQ.data, productionLinesQ.isLoading]);

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

  const isQuotePrintRoute =
    pathname.includes("/sales/quotes/") && pathname.endsWith("/print");

  return (
    <div
      className={cn(
        "min-h-screen min-h-[100dvh] flex bg-slate-50",
        isQuotePrintRoute && "quote-print-shell"
      )}
    >
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white",
          "transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          isQuotePrintRoute && "hidden print:hidden"
        )}
        aria-label="Menu lateral"
      >
        <div className="flex h-[100dvh] flex-col">
        <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-slate-200">
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

        <UrgentAlertsSummary alerts={menuAlerts} />

        <nav className="flex-1 min-h-0 p-3 flex flex-col gap-1 overflow-y-auto">
          {visibleMenu.map((entry) => {
            if (entry.type === "link") {
              const Icon = entry.icon;
              const active = pathActive(pathname, entry.href);
              const alertEntry = alertEntryForHref(menuAlerts, entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                    active
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-slate-700 hover:bg-slate-100",
                    menuOpenActivityClass(alertEntry?.level, active)
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <MenuItemLabel title={entry.title} entry={alertEntry} />
                </Link>
              );
            }

            const open = openGroups[entry.title] === true;
            const anyChildActive = entry.children.some((c) =>
              pathActive(pathname, c.href)
            );
            const GroupIcon = entry.icon;
            const childHrefs = entry.children
              .map((c) => c.href)
              .filter((h) => h !== LOADING_LINES_NAV_HREF);
            const groupAlert = groupAlertTotal(childHrefs, menuAlerts ?? {});
            const groupEntry =
              groupAlert.count > 0 ? groupAlert : undefined;

            return (
              <div key={entry.title} className="rounded-md">
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.title)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left",
                    anyChildActive
                      ? "bg-slate-100 text-slate-900 font-medium"
                      : "text-slate-800 hover:bg-slate-50",
                    menuOpenActivityClass(groupEntry?.level, anyChildActive)
                  )}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <MenuItemLabel title={entry.title} entry={groupEntry} />
                </button>
                {open ? (
                  <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                    {entry.children.map((c) => {
                      const CIcon = c.icon;
                      const active =
                        c.href !== LOADING_LINES_NAV_HREF &&
                        pathActive(pathname, c.href);
                      if (c.href === LOADING_LINES_NAV_HREF) {
                        return (
                          <span
                            key={c.href}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-400 italic"
                          >
                            <CIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>{c.title}</span>
                          </span>
                        );
                      }
                      const childEntry = alertEntryForHref(menuAlerts, c.href);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                            active
                              ? "bg-brand-50 text-brand-700 font-medium"
                              : "text-slate-600 hover:bg-slate-100",
                            menuOpenActivityClass(childEntry?.level, active)
                          )}
                        >
                          <CIcon className="h-3.5 w-3.5 shrink-0" />
                          <MenuItemLabel title={c.title} entry={childEntry} />
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200 p-3 bg-white">
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
        <header
          className={cn(
            "sticky top-0 z-20 h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 lg:px-6",
            isQuotePrintRoute && "print:hidden hidden"
          )}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-slate-600 hover:text-slate-900"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-medium text-slate-700">
            HD Soluções Industriais
          </h1>
        </header>

        <main
          className={cn(
            "flex-1 min-w-0",
            isQuotePrintRoute && "print:p-0"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
