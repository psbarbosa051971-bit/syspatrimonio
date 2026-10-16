import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ChecklistVeiculoDialog } from "@/components/ChecklistVeiculoDialog";
import { Button } from "@/components/ui/button";
import { InstalarApp } from "@/components/InstalarApp";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Novo checklist de veículo — SysPatrimônio" },
      { name: "description", content: "Aplicativo de celular para preencher o checklist de recebimento de veículos." },
      { property: "og:title", content: "Novo checklist de veículo — SysPatrimônio" },
      { property: "og:description", content: "Preencha o checklist de veículos pelo celular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChecklistApp,
});

function ChecklistApp() {
  const { session, loading } = useAuth();
  const [chave, setChave] = useState(0);

  // Instala este endereço como um aplicativo separado, que abre direto no formulário.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const anterior = link.href;
    link.href = "/checklist.webmanifest";
    return () => { link.href = anterior; };
  }, []);

  if (loading) return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  if (!session) return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <h1 className="text-xl font-bold text-primary">Checklist de veículos</h1>
    <p className="text-sm text-muted-foreground">Entre com sua conta para preencher o checklist. Depois volte a este endereço.</p>
    <Button asChild><Link to="/entrar">Entrar</Link></Button>
    <InstalarApp compacto />
  </main>;

  return <main className="min-h-dvh bg-background">
    <ChecklistVeiculoDialog key={chave} checklist={null} mostrarInstalacao onSaved={() => {}} onClose={() => setChave((c) => c + 1)} />
  </main>;
}
