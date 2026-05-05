import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Quadros",
};

export const dynamic = "force-dynamic";

export default function BoardsPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Quadros</h2>
          <p className="text-sm text-slate-500 mt-1">
            Organize tarefas em quadros Kanban customizáveis.
          </p>
        </div>
        <Button
          type="button"
          disabled
          className="self-start sm:self-auto"
          title="Disponível após criar o schema no Supabase (PASSO 2)"
        >
          <Plus className="h-4 w-4" />
          <span>Novo quadro</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <KanbanSquare className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Bem-vindo ao Módulo 1</CardTitle>
              <CardDescription>
                Estrutura inicial pronta. Continue para os próximos passos para
                criar o schema no Supabase e habilitar criação de quadros.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <ol className="space-y-2 text-sm text-slate-700">
            <li className="flex gap-2">
              <span className="font-mono text-brand-700">1.</span>
              <span>
                Configure o projeto Supabase{" "}
                <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">
                  erp-hd-solucoes
                </code>{" "}
                e preencha <code className="font-mono text-xs">.env.local</code>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-brand-700">2.</span>
              <span>
                Execute o schema SQL do Módulo 1 no SQL Editor (PASSO 2 do
                prompt mestre).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-brand-700">3.</span>
              <span>
                Rode <code className="font-mono text-xs">npm run supabase:types</code>{" "}
                para gerar os tipos TypeScript do banco.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-brand-700">4.</span>
              <span>
                Avance para o Sprint 1 (criação de quadros e colunas padrão).
              </span>
            </li>
          </ol>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <Link
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-700 hover:underline"
            >
              Abrir Supabase Dashboard ↗
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
