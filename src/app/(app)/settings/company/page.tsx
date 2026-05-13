"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Download, Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import type { Tables } from "@/lib/types/database";

type CompanyRow = Tables<"company_settings">;

type TabKey = "info" | "address" | "documents";

async function fetchCompany(): Promise<CompanyRow | null> {
  const res = await fetch("/api/company/settings", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CompanyRow | null;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar dados da empresa");
  return json.data ?? null;
}

async function createCompany(): Promise<CompanyRow> {
  const res = await fetch("/api/company/settings", {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CompanyRow;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao criar registo");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function saveCompany(
  payload: Record<string, unknown>
): Promise<CompanyRow> {
  const res = await fetch("/api/company/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CompanyRow;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao gravar");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

function emptyDraft(): Partial<CompanyRow> {
  return {
    cnpj: null,
    company_name: "",
    trade_name: null,
    state_registration: null,
    municipal_registration: null,
    tax_regime: null,
    address_street: null,
    address_number: null,
    address_complement: null,
    address_neighborhood: null,
    address_city: null,
    address_state: null,
    address_zip: null,
    phone: null,
    email: null,
    website: null,
    logo_url: null,
    document_header: null,
    document_footer: null,
    default_ncm: "84213990",
    default_payment_terms: "30 dias",
    default_delivery_days: 30,
    das_aliquot: null,
  };
}

export default function CompanySettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabKey>("info");
  const [draft, setDraft] = useState<Partial<CompanyRow>>(emptyDraft);
  const [exporting, setExporting] = useState(false);

  const companyQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompany,
    enabled: !meLoading && me?.role === "admin",
  });

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Acesso reservado a administradores.");
      router.replace("/settings/profile");
    }
  }, [me, meLoading, router]);

  useEffect(() => {
    const row = companyQuery.data;
    if (!row) return;
    setDraft({
      ...row,
      default_delivery_days:
        row.default_delivery_days != null ?
          Number(row.default_delivery_days)
        : 30,
      das_aliquot:
        row.tax_regime === "simples_nacional" &&
        (row.das_aliquot == null || !Number.isFinite(Number(row.das_aliquot)))
          ? 6
          : row.das_aliquot != null
            ? Number(row.das_aliquot)
            : null,
    });
  }, [companyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: saveCompany,
    onSuccess: async () => {
      toast.success("Configurações da empresa gravadas.");
      await queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: async () => {
      toast.success("Registo inicial criado.");
      await queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadPending = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/company/upload-logo", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as {
        logo_url?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro no upload");
      if (!json.logo_url) throw new Error("URL não devolvido");
      return json.logo_url;
    },
    onSuccess: (logo_url) => {
      setDraft((d) => ({ ...d, logo_url }));
      toast.success("Imagem enviada. Guarde as alterações para persistir o URL.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payloadFromDraft = useMemo(() => {
    const d = draft;
    return {
      cnpj: d.cnpj ?? null,
      company_name: d.company_name?.trim() || "",
      trade_name: d.trade_name ?? null,
      state_registration: d.state_registration ?? null,
      municipal_registration: d.municipal_registration ?? null,
      tax_regime: d.tax_regime ?? null,
      address_street: d.address_street ?? null,
      address_number: d.address_number ?? null,
      address_complement: d.address_complement ?? null,
      address_neighborhood: d.address_neighborhood ?? null,
      address_city: d.address_city ?? null,
      address_state: d.address_state ?? null,
      address_zip: d.address_zip ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      website: d.website ?? null,
      logo_url: d.logo_url ?? null,
      document_header: d.document_header ?? null,
      document_footer: d.document_footer ?? null,
      default_ncm: d.default_ncm ?? null,
      default_payment_terms: d.default_payment_terms ?? null,
      default_delivery_days:
        d.default_delivery_days != null ?
          Math.floor(Number(d.default_delivery_days))
        : null,
      das_aliquot:
        d.tax_regime === "simples_nacional" &&
        d.das_aliquot != null &&
        Number.isFinite(Number(d.das_aliquot))
          ? Math.min(100, Math.max(0, Number(d.das_aliquot)))
          : null,
    };
  }, [draft]);

  function handleSave() {
    if (!draft.company_name?.trim()) {
      toast.error("Razão social é obrigatória.");
      setTab("info");
      return;
    }
    if (draft.tax_regime === "simples_nacional") {
      const d = Number(draft.das_aliquot);
      if (
        draft.das_aliquot == null ||
        !Number.isFinite(d) ||
        d < 0 ||
        d > 100
      ) {
        toast.error(
          "Em Simples Nacional indique a alíquota DAS (%) entre 0 e 100 (sugestão: 6)."
        );
        setTab("info");
        return;
      }
    }
    saveMutation.mutate(payloadFromDraft);
  }

  async function handleExportLgpd() {
    setExporting(true);
    try {
      const res = await fetch("/api/company/export-data", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-lgpd-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na exportação");
    } finally {
      setExporting(false);
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "info", label: "Informações" },
    { key: "address", label: "Endereço" },
    { key: "documents", label: "Documentos" },
  ];

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/settings/profile">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Building2 className="h-8 w-8 text-slate-600" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Configurações da empresa
            </h1>
            <p className="text-sm text-slate-600">
              Dados usados em documentos e identificação fiscal.
            </p>
          </div>
        </div>
      </div>

      {companyQuery.isLoading ? (
        <div className="flex justify-center py-16 text-slate-500 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>A carregar…</span>
        </div>
      ) : companyQuery.error ? (
        <p className="text-red-600 text-sm">
          {companyQuery.error instanceof Error
            ? companyQuery.error.message
            : "Erro ao carregar"}
        </p>
      ) : companyQuery.data === null ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <p className="text-sm text-slate-600">
              Ainda não existe registo de configurações para este tenant.
            </p>
            <Button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Criar configurações
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  tab === t.key ?
                    "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "info" ? (
            <Card>
              <CardHeader>
                <CardTitle>Dados da empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input
                      id="cnpj"
                      value={draft.cnpj ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, cnpj: e.target.value || null }))
                      }
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tax_regime">Regime tributário</Label>
                    <select
                      id="tax_regime"
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-950 dark:border-slate-600"
                      value={draft.tax_regime ?? ""}
                      onChange={(e) =>
                        setDraft((d) => {
                          const v =
                            e.target.value === "" ?
                              null
                            : (e.target.value as CompanyRow["tax_regime"]);
                          const next = { ...d, tax_regime: v };
                          if (v === "simples_nacional") {
                            if (
                              d.das_aliquot == null ||
                              !Number.isFinite(Number(d.das_aliquot))
                            ) {
                              return { ...next, das_aliquot: 6 };
                            }
                          }
                          return next;
                        })
                      }
                    >
                      <option value="">— Seleccionar —</option>
                      <option value="simples_nacional">Simples Nacional</option>
                      <option value="lucro_presumido">Lucro Presumido</option>
                      <option value="lucro_real">Lucro Real</option>
                    </select>
                  </div>
                  {draft.tax_regime === "simples_nacional" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="das_aliquot">
                        Alíquota DAS (%) <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="das_aliquot"
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        required
                        value={
                          draft.das_aliquot != null ?
                            String(draft.das_aliquot)
                          : ""
                        }
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            das_aliquot:
                              e.target.value === "" ? null : (
                                parseFloat(e.target.value)
                              ),
                          }))
                        }
                        placeholder="6"
                      />
                      <p className="text-xs text-slate-500">
                        Usada na precificação BDI quando o regime é Simples Nacional.
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="company_name">Razão social *</Label>
                    <Input
                      id="company_name"
                      value={draft.company_name ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          company_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="trade_name">Nome fantasia</Label>
                    <Input
                      id="trade_name"
                      value={draft.trade_name ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          trade_name: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state_registration">Inscrição estadual</Label>
                    <Input
                      id="state_registration"
                      value={draft.state_registration ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          state_registration: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="municipal_registration">
                      Inscrição municipal
                    </Label>
                    <Input
                      id="municipal_registration"
                      value={draft.municipal_registration ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          municipal_registration: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Contacto
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        value={draft.phone ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            phone: e.target.value || null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={draft.email ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            email: e.target.value || null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="website">Site</Label>
                      <Input
                        id="website"
                        value={draft.website ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            website: e.target.value || null,
                          }))
                        }
                        placeholder="https://"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Logótipo
                  </h3>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadPending.mutate(f);
                    }}
                  />
                  <div className="flex flex-wrap items-end gap-4">
                    {draft.logo_url?.trim() ? (
                      <div className="rounded-lg border border-slate-200 p-2 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.logo_url.trim()}
                          alt="Pré-visualização do logótipo"
                          className="max-h-24 w-auto object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Nenhum logótipo definido.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadPending.isPending}
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploadPending.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Enviar imagem
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="logo_url">URL do logótipo (opcional)</Label>
                    <Input
                      id="logo_url"
                      value={draft.logo_url ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          logo_url: e.target.value || null,
                        }))
                      }
                      placeholder="https://…"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "address" ? (
            <Card>
              <CardHeader>
                <CardTitle>Endereço</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="address_zip">CEP</Label>
                  <Input
                    id="address_zip"
                    value={draft.address_zip ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_zip: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address_street">Rua</Label>
                  <Input
                    id="address_street"
                    value={draft.address_street ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_street: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_number">Número</Label>
                  <Input
                    id="address_number"
                    value={draft.address_number ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_number: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    value={draft.address_complement ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_complement: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address_neighborhood">Bairro</Label>
                  <Input
                    id="address_neighborhood"
                    value={draft.address_neighborhood ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_neighborhood: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_city">Cidade</Label>
                  <Input
                    id="address_city"
                    value={draft.address_city ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_city: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_state">Estado (UF)</Label>
                  <Input
                    id="address_state"
                    maxLength={2}
                    value={draft.address_state ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        address_state: e.target.value.toUpperCase() || null,
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "documents" ? (
            <Card>
              <CardHeader>
                <CardTitle>Documentos e padrões</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-1.5">
                  <Label htmlFor="document_header">Cabeçalho (propostas / impressão)</Label>
                  <Textarea
                    id="document_header"
                    rows={4}
                    value={draft.document_header ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        document_header: e.target.value || null,
                      }))
                    }
                    placeholder="Texto opcional acima do corpo do documento"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="document_footer">Rodapé</Label>
                  <Textarea
                    id="document_footer"
                    rows={4}
                    value={draft.document_footer ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        document_footer: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4 border-t border-slate-200 pt-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="default_ncm">NCM padrão</Label>
                    <Input
                      id="default_ncm"
                      value={draft.default_ncm ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          default_ncm: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="default_payment_terms">
                      Prazo de pagamento padrão
                    </Label>
                    <Input
                      id="default_payment_terms"
                      value={draft.default_payment_terms ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          default_payment_terms: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="default_delivery_days">
                      Prazo de entrega (dias)
                    </Label>
                    <Input
                      id="default_delivery_days"
                      type="number"
                      min={0}
                      step={1}
                      value={
                        draft.default_delivery_days != null ?
                          String(draft.default_delivery_days)
                        : ""
                      }
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          default_delivery_days:
                            e.target.value === "" ? null : (
                              parseInt(e.target.value, 10)
                            ),
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Dados pessoais (LGPD)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>
                Exporte uma cópia dos dados do tenant em JSON para arquivo ou pedido
                do titular.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  onClick={() => void handleExportLgpd()}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1">Exportar dados (LGPD)</span>
                </Button>
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-700 hover:underline"
                >
                  Política de privacidade
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => handleSave()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar alterações
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
