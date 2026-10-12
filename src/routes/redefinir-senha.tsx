import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { RedefinirSenha } from "@/components/RedefinirSenha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — SysPatrimônio" },
      { name: "description", content: "Crie uma nova senha para acessar sua conta." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PaginaRedefinirSenha,
});

function PaginaRedefinirSenha() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">Redefinir senha</CardTitle>
          <CardDescription>Recupere o acesso ao SysPatrimônio</CardDescription>
        </CardHeader>
        <CardContent><RedefinirSenha /></CardContent>
      </Card>
    </div>
  );
}
