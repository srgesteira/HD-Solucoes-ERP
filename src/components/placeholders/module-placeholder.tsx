import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  title: string;
  description?: string;
  icon?: LucideIcon;
};

export function ModulePlaceholder({
  title,
  description = "Em desenvolvimento — funcionalidade será implementada em breve.",
  icon: Icon = Construction,
}: Props) {
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardContent className="py-14 text-center space-y-4">
          <Icon className="h-10 w-10 mx-auto text-slate-400" aria-hidden />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
