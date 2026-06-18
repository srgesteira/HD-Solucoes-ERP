/** Módulos exibidos no portal (home) com mini-dashboards. */
export type HomeModuleDef = {
  key: string;
  name: string;
  description: string;
  href: string;
};

export const HOME_MODULES: HomeModuleDef[] = [
  {
    key: "vendas",
    name: "Vendas",
    description: "Orçamentos e pedidos",
    href: "/sales/dashboard",
  },
  {
    key: "compras",
    name: "Compras",
    description: "Pedidos e fornecedores",
    href: "/purchasing/dashboard",
  },
  {
    key: "faturamento",
    name: "Faturamento",
    description: "Crédito, AR/AP e fiscal",
    href: "/faturamento/fiscal",
  },
  {
    key: "pcp",
    name: "PCP",
    description: "Planeamento e MRP",
    href: "/logistics/pcp",
  },
  {
    key: "producao",
    name: "Produção",
    description: "Ordens e linhas",
    href: "/production/dashboard",
  },
  {
    key: "boards",
    name: "Tarefas",
    description: "Quadros Kanban",
    href: "/boards",
  },
];
