import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  parseCsvBankLines,
  parseOfxBankLines,
} from "@/modules/finance/lib/bank-import-parser";
import { autoMatchBankImport } from "@/modules/finance/lib/bank-reconciliation-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("finance");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("bank_imports")
    .select("id, file_name, file_format, imported_at, status")
    .eq("tenant_id", tenantId)
    .order("imported_at", { ascending: false })
    .limit(50);

  if (error) return apiError(error.message, 500);
  return apiOk({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("finance");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fileName = typeof b.file_name === "string" ? b.file_name.trim() : "";
  const format = b.format === "ofx" ? "ofx" : "csv";
  const content = typeof b.content === "string" ? b.content : "";
  if (!fileName || !content) {
    return apiError("file_name e content são obrigatórios", 400);
  }

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const { data: imp, error: impErr } = await db
    .from("bank_imports")
    .insert({
      tenant_id: tenantId,
      file_name: fileName,
      file_format: format,
      imported_by: user.id,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (impErr || !imp?.id) {
    return apiError(impErr?.message ?? "Erro ao gravar importação", 500);
  }

  try {
    const lines =
      format === "ofx"
        ? parseOfxBankLines(content)
        : parseCsvBankLines(content);

    if (!lines.length) {
      await db
        .from("bank_imports")
        .update({ status: "failed", error_message: "Nenhuma linha parseada" })
        .eq("id", imp.id);
      return apiError("Nenhuma linha válida no ficheiro", 400);
    }

    const rows = lines.map((line) => ({
      tenant_id: tenantId,
      bank_import_id: imp.id,
      transaction_date: line.date,
      amount: line.amount,
      description: line.description,
      document_number: line.documentNumber,
    }));

    const { error: lineErr } = await db.from("bank_statement_lines").insert(rows);
    if (lineErr) throw new Error(lineErr.message);

    await db
      .from("bank_imports")
      .update({ status: "processed" })
      .eq("id", imp.id);

    const matchResult = await autoMatchBankImport(admin, tenantId, imp.id);

    return apiOk(
      {
        import_id: imp.id,
        lines: rows.length,
        auto_matched: matchResult.matched,
        unmatched: matchResult.unmatched,
      },
      201
    );
  } catch (e) {
    await db
      .from("bank_imports")
      .update({
        status: "failed",
        error_message: e instanceof Error ? e.message : "Erro",
      })
      .eq("id", imp.id);
    return apiError(e instanceof Error ? e.message : "Erro ao importar", 500);
  }
}
