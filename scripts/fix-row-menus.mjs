import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");

function patchCustomers() {
  const p = path.join(root, "src/app/(app)/customers/page.tsx");
  let t = fs.readFileSync(p, "utf8");
  const marker = '<td className="px-3 py-2.5 text-right relative">';
  const start = t.indexOf(marker);
  if (start < 0) throw new Error("customers marker not found");
  const end = t.indexOf("</td>", start) + 5;
  const rep = `                      <td className="px-3 py-2.5 text-right">
                        {canManage ? (
                          <RowActionsMenu
                            items={[
                              {
                                id: "edit",
                                label: "Editar",
                                icon: <Edit className="h-4 w-4" />,
                                onClick: () => openEdit(row),
                              },
                              {
                                id: "toggle",
                                label: row.is_active ? "Desativar" : "Reativar",
                                icon:
                                  row.is_active ? (
                                    <UserX className="h-4 w-4" />
                                  ) : (
                                    <User className="h-4 w-4" />
                                  ),
                                disabled: toggleBusy === row.id,
                                onClick: () => void handleToggleActive(row),
                              },
                            ]}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>`;
  t = t.slice(0, start) + rep + t.slice(end);
  if (!t.includes("RowActionsMenu")) {
    t = t.replace(
      'import { cn } from "@/lib/utils/cn";',
      'import { cn } from "@/lib/utils/cn";\nimport { RowActionsMenu } from "@/components/ui/row-actions-menu";'
    );
  }
  t = t.replace(
    /  const \[menuOpenFor, setMenuOpenFor\] = useState<string \| null>\(null\);\n/,
    ""
  );
  fs.writeFileSync(p, t);
}

function patchSuppliers() {
  const p = path.join(root, "src/app/(app)/purchasing/suppliers/page.tsx");
  let t = fs.readFileSync(p, "utf8");
  if (!t.includes("RowActionsMenu")) {
    t = t.replace(
      'import { cn } from "@/lib/utils/cn";',
      'import { cn } from "@/lib/utils/cn";\nimport { RowActionsMenu } from "@/components/ui/row-actions-menu";'
    );
  }
  const blockStart = t.indexOf("{isAdmin ? (\n                          <>");
  const blockEnd = t.indexOf(") : null}", blockStart);
  if (blockStart < 0 || blockEnd < 0) throw new Error("suppliers block not found");
  const rep = `{isAdmin ? (
                          <RowActionsMenu
                            items={[
                              {
                                id: "edit",
                                label: "Editar",
                                icon: <Edit className="h-4 w-4" />,
                                onClick: () =>
                                  router.push(
                                    \`/purchasing/suppliers/\${supplier.id}/edit\`
                                  ),
                              },
                              {
                                id: "toggle",
                                label: supplier.is_active ? "Desativar" : "Reativar",
                                icon: supplier.is_active ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <User className="h-4 w-4" />
                                ),
                                disabled: toggleBusy === supplier.id,
                                onClick: () => void handleToggleActive(supplier),
                              },
                            ]}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )`;
  t = t.slice(0, blockStart) + rep + t.slice(blockEnd + ") : null}".length);
  t = t.replace(
    /  const \[menuOpenFor, setMenuOpenFor\] = useState<string \| null>\(null\);\n/,
    ""
  );
  // remove orphaned button/menu inside td if still present
  const tdStart = t.indexOf("<td className=\"px-3 py-2.5 text-right relative\">");
  if (tdStart >= 0) {
    const tdEnd = t.indexOf("</td>", tdStart) + 5;
    const inner = `{isAdmin ? (
                          <RowActionsMenu
                            items={[
                              {
                                id: "edit",
                                label: "Editar",
                                icon: <Edit className="h-4 w-4" />,
                                onClick: () =>
                                  router.push(
                                    \`/purchasing/suppliers/\${supplier.id}/edit\`
                                  ),
                              },
                              {
                                id: "toggle",
                                label: supplier.is_active ? "Desativar" : "Reativar",
                                icon: supplier.is_active ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <User className="h-4 w-4" />
                                ),
                                disabled: toggleBusy === supplier.id,
                                onClick: () => void handleToggleActive(supplier),
                              },
                            ]}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}`;
    t = t.slice(0, tdStart) + `<td className="px-3 py-2.5 text-right">\n                        ${inner}\n                      </td>` + t.slice(tdEnd);
  }
  fs.writeFileSync(p, t);
}

patchCustomers();
patchSuppliers();
console.log("patched customers and suppliers");
