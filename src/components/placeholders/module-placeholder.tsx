import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { AppPage } from "@/shared/ui/app-page";
import { Card, CardContent } from "@/shared/ui/card";

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
    <AppPage title={title} description={description} width="narrow" density="comfortable">
      <Card>
        <CardContent className="py-14 text-center space-y-4">
          <Icon className="h-10 w-10 mx-auto text-slate-400" aria-hidden />
          <p className="text-sm text-slate-600 max-w-md mx-auto">{description}</p>
        </CardContent>
      </Card>
    </AppPage>
  );
}
