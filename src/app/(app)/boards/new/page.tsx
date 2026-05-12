"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateBoard } from "@/hooks/use-boards";
import { createBoardSchema } from "@/lib/validators/board";

const PRESET_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#0f766e", label: "Teal" },
  { value: "#1e40af", label: "Azul" },
  { value: "#7c3aed", label: "Roxo" },
  { value: "#db2777", label: "Rosa" },
  { value: "#ea580c", label: "Laranja" },
  { value: "#16a34a", label: "Verde" },
  { value: "#475569", label: "Cinza" },
];

export default function NewBoardPage() {
  const router = useRouter();
  const createBoard = useCreateBoard();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PRESET_COLORS[0].value);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});

    const parsed = createBoardSchema.safeParse({
      name,
      description: description || undefined,
      color,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      const board = await createBoard.mutateAsync(parsed.data);
      toast.success("Projeto criado!");
      router.push(`/boards/${board.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar projeto");
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/boards"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para tarefas
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Novo projeto</CardTitle>
          <CardDescription>
            Vamos criar um projeto Kanban com 3 colunas padrão (A Fazer, Em Andamento,
            Concluído). Poderá customizar as colunas depois.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4"
            noValidate
          >
            <div>
              <Label htmlFor="name">Nome do projeto *</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: HD Consultoria 2026"
                autoFocus
                required
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name ? (
                <p id="name-error" className="mt-1 text-xs text-red-600">
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Para que serve este projeto?"
                className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-60 resize-none"
              />
              {errors.description ? (
                <p className="mt-1 text-xs text-red-600">{errors.description}</p>
              ) : null}
            </div>

            <div>
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PRESET_COLORS.map((c) => {
                  const selected = color === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className={
                        "h-8 w-8 rounded-full border-2 transition-all " +
                        (selected
                          ? "border-slate-900 scale-110"
                          : "border-transparent hover:scale-105")
                      }
                      style={{ backgroundColor: c.value }}
                      aria-label={`Cor ${c.label}`}
                      aria-pressed={selected}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
              <Button type="submit" disabled={createBoard.isPending}>
                {createBoard.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Criando…</span>
                  </>
                ) : (
                  <span>Criar projeto</span>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/boards")}
                disabled={createBoard.isPending}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
