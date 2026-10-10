import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SysPatrimônio — Gestão de Patrimônio" },
      {
        name: "description",
        content:
          "SysPatrimônio: cadastro de departamentos, salas e bens patrimoniais com importação de termos em PDF.",
      },
      { property: "og:title", content: "SysPatrimônio — Gestão de Patrimônio" },
      {
        property: "og:description",
        content:
          "Cadastro de departamentos, salas e bens patrimoniais com importação de termos em PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/departamentos" });
  }, [loading, session, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-primary px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Building2 className="h-7 w-7 text-primary-foreground" />
          <span className="text-xl font-bold tracking-tight text-primary-foreground">
            SysPatrimônio
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Gestão de Patrimônio
          </h1>
          <p className="mt-3 text-muted-foreground">
            Cadastre departamentos, salas e bens patrimoniais. Importe termos de
            responsabilidade em PDF e mantenha o controle do seu almoxarifado.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button asChild size="lg">
              <Link to="/entrar">Entrar</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/criar-conta">Criar conta</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        SysPatrimônio — Controle patrimonial
      </footer>
    </div>
  );
}
