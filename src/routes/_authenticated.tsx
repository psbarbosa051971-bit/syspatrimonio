import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { RelatoriosBens } from "@/components/RelatoriosBens";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/entrar" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return <>
    {role === "admin" && <div className="border-b border-border bg-background px-4 py-3">
      <div className="mx-auto max-w-[1400px]">
        <RelatoriosBens key={session.user.id} administrador />
      </div>
    </div>}
    <Outlet />
  </>;
}
