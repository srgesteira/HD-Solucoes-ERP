"use client";

import { CheckCircle2, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";

type FinanceRowActionsProps = {
  canEdit?: boolean;
  canSettle?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  settleLabel?: string;
  onEdit?: () => void;
  onSettle?: () => void;
  onDelete?: () => void;
};

export function FinanceRowActions({
  canEdit = false,
  canSettle = false,
  canDelete = false,
  deleting = false,
  settleLabel = "Concretizar",
  onEdit,
  onSettle,
  onDelete,
}: FinanceRowActionsProps) {
  if (!canEdit && !canSettle && !canDelete) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex justify-end items-center gap-1">
      {canSettle && onSettle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-emerald-700 hover:text-emerald-800"
          aria-label={settleLabel}
          title={settleLabel}
          onClick={onSettle}
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      ) : null}
      {canEdit && onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Editar"
          title="Editar"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {canDelete && onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-700 hover:text-red-800"
          aria-label="Excluir"
          title="Excluir"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      ) : null}
    </div>
  );
}
