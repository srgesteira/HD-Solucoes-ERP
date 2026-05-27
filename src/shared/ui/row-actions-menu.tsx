"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";

export type RowActionItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger" | "success";
  hidden?: boolean;
  disabled?: boolean;
};

type Props = {
  items: RowActionItem[];
  menuWidth?: number;
  ariaLabel?: string;
};

const DEFAULT_WIDTH = 224;

export function RowActionsMenu({
  items,
  menuWidth = DEFAULT_WIDTH,
  ariaLabel = "Abrir menu de acções",
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const visibleItems = items.filter((i) => !i.hidden);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = r.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    setCoords({ top: r.bottom + 4, left });
  }, [menuWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  if (!visibleItems.length) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              role="presentation"
              className="fixed inset-0 z-[200]"
              onClick={close}
            />
            <div
              role="menu"
              className={cn(
                "fixed z-[201] rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg",
                "dark:bg-slate-950 dark:border-slate-700"
              )}
              style={{ top: coords.top, left: coords.left, width: menuWidth }}
            >
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm disabled:opacity-50",
                    item.variant === "danger" &&
                      "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30",
                    item.variant === "success" &&
                      "text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30",
                    (!item.variant || item.variant === "default") &&
                      "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                  )}
                  onClick={() => {
                    if (item.disabled) return;
                    close();
                    item.onClick();
                  }}
                >
                  {item.icon ? (
                    <span className="shrink-0">{item.icon}</span>
                  ) : null}
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <Button
        ref={btnRef}
        type="button"
        variant="outline"
        size="sm"
        className="h-8 px-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else {
            updatePosition();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {menu}
    </>
  );
}
