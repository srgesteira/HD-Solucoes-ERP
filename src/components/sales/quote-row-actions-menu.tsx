"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Check,
  Edit,
  Eye,
  FilePenLine,
  MoreHorizontal,
  Send,
  XCircle,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

export type QuoteRowActionsQuote = {
  id: string;
  quote_number: string;
  status: string;
};

type Props = {
  row: QuoteRowActionsQuote;
  isAdmin: boolean;
  canEditQuotes: boolean;
  onStatusAction: (
    row: QuoteRowActionsQuote,
    status: string,
    successMessage: string
  ) => void | Promise<void>;
  onApprove: (row: QuoteRowActionsQuote) => void | Promise<void>;
  onReject: (row: QuoteRowActionsQuote) => void;
};

const MENU_WIDTH = 240;

export function QuoteRowActionsMenu({
  row,
  isAdmin,
  canEditQuotes,
  onStatusAction,
  onApprove,
  onReject,
}: Props) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const closeMenu = useCallback(() => {
    if (detailsRef.current) detailsRef.current.open = false;
    setMenuPos(null);
  }, []);

  const updatePosition = useCallback(() => {
    const el = detailsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    const top = rect.bottom + 4;
    setMenuPos({ top, left });
  }, []);

  const handleToggle = () => {
    const open = detailsRef.current?.open ?? false;
    if (open) updatePosition();
    else setMenuPos(null);
  };

  useEffect(() => {
    if (!menuPos) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [menuPos, updatePosition]);

  const st = row.status;
  const showEdit = canEditQuotes && st === "draft";
  const showRevise =
    canEditQuotes &&
    (st === "sent" || st === "approved" || st === "revision");
  const showSend = isAdmin && st === "draft";
  const showApproveReject = isAdmin && (st === "draft" || st === "sent");

  const menu =
    menuPos && mounted ?
      createPortal(
        <>
          <div
            role="presentation"
            className="fixed inset-0 z-[200]"
            onClick={closeMenu}
          />
          <div
            role="menu"
            className="fixed z-[201] w-60 rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg dark:bg-slate-950 dark:border-slate-700"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => {
                closeMenu();
                router.push(`/sales/quotes/${row.id}`);
              }}
            >
              <Eye className="h-4 w-4 shrink-0" />
              Visualizar
            </button>
            {showEdit ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => {
                  closeMenu();
                  router.push(`/sales/quotes/${row.id}/edit`);
                }}
              >
                <Edit className="h-4 w-4 shrink-0" />
                Editar
              </button>
            ) : null}
            {showRevise ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
                onClick={() => {
                  closeMenu();
                  router.push(`/sales/quotes/${row.id}/edit`);
                }}
              >
                <FilePenLine className="h-4 w-4 shrink-0" />
                Revisar
              </button>
            ) : null}
            {showSend ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => {
                  closeMenu();
                  void onStatusAction(
                    row,
                    "sent",
                    "Orçamento marcado como enviado."
                  );
                }}
              >
                <Send className="h-4 w-4 shrink-0" />
                Enviar
              </button>
            ) : null}
            {showApproveReject ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                onClick={() => {
                  closeMenu();
                  void onApprove(row);
                }}
              >
                <Check className="h-4 w-4 shrink-0" />
                Aprovar
              </button>
            ) : null}
            {showApproveReject ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => {
                  closeMenu();
                  onReject(row);
                }}
              >
                <XCircle className="h-4 w-4 shrink-0" />
                Rejeitar
              </button>
            ) : null}
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <details
        ref={detailsRef}
        className="relative inline-block text-left"
        onToggle={handleToggle}
      >
        <summary
          className={cn(
            "list-none [&::-webkit-details-marker]:hidden cursor-pointer",
            "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white",
            "hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
            "dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-900"
          )}
          aria-label="Abrir menu de acções"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </summary>
      </details>
      {menu}
    </>
  );
}
