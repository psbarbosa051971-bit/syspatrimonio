import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRole, type Papel } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Gerenciar usuários — SysPatrimônio" },
      { name: "description", content: "Gerencie usuários e permissões do SysPatrimônio." },
      { property: "og:title", content: "Gerenciar usuários — SysPatrimônio" },
      { property: "og:description", content: "Permissões: administrador, operador e visualizador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsuariosPage,
});

type Linha = { id: string; email: string | null; role: Papel | null };

const NOMES: Record<Papel, string> = {
  admin: "Administrador",
  operador: "Operador",
  visualizador: "Visualizador",
};

function UsuariosPage() {
  const { user } = useAuth();
  const { role, loading } = useRole();
  const [linhas, setLinhas] = useState<Linha[]>([]);

  async function carregar() {
    const [{ data: perfis }, { data: papeis }] = await Promise.all([
      supabase.from("profiles").select("id,email").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    setLinhas(
      (perfis ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        role: (papeis?.find((r) => r.user_id === p.id)?.role as Papel) ?? null,
      })),
    );
  }

  useEffect(() => {
    if (role === "admin") carregar();
  }, [role]);

  async function mudar(id: string, novo: Papel) {
    const { error } = await supabase
      .from("user_roles")
      .upsert({ user_id: id, role: novo }, { onConflict: "user_id" });
    if (error) {
      toast.error("Erro ao alterar permissão");
      return;
    }
    toast.success("Permissão atualizada");
    carregar();
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;
  if (role !== "admin")
    return <p className="p-6 text-sm text-muted-foreground">Acesso restrito ao administrador.</p>;

  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/departamentos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Gerenciar usuários</CardTitle>
            <CardDescription>
              Novos usuários entram como Visualizador. Altere a permissão de cada um abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-48">Permissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.email}</TableCell>
                    <TableCell>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={l.role ?? ""}
                        disabled={l.id === user?.id}
                        onChange={(e) => mudar(l.id, e.target.value as Papel)}
                      >
                        <option value="" disabled>Sem permissão</option>
                        {(Object.keys(NOMES) as Papel[]).map((p) => (
                          <option key={p} value={p}>{NOMES[p]}</option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
