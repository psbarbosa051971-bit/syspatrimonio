import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRole, type Papel } from "@/hooks/use-role";
import { criarUsuario } from "@/lib/usuarios.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Gerenciar usuários — SysPatrimônio" },
      { name: "description", content: "Cadastre usuários e defina permissões no SysPatrimônio." },
      { property: "og:title", content: "Gerenciar usuários — SysPatrimônio" },
      { property: "og:description", content: "Permissões: administrador, operador e visualizador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsuariosPage,
});

type Linha = { id: string; email: string | null; role: Papel | null; salas: string[] };
type SalaMin = { id: string; nome: string };

const NOMES: Record<Papel, string> = {
  admin: "Administrador",
  operador: "Operador",
  visualizador: "Visualizador",
};

function SeletorSalas({
  salas,
  valor,
  onChange,
}: {
  salas: SalaMin[];
  valor: string[];
  onChange: (v: string[]) => void;
}) {
  if (salas.length === 0) return <p className="text-xs text-muted-foreground">Nenhum local cadastrado.</p>;
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
      {salas.map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={valor.includes(s.id)}
            onChange={(e) => onChange(e.target.checked ? [...valor, s.id] : valor.filter((x) => x !== s.id))}
          />
          {s.nome}
        </label>
      ))}
    </div>
  );
}

function UsuariosPage() {
  const { user } = useAuth();
  const { role, loading } = useRole();
  const criar = useServerFn(criarUsuario);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [salas, setSalas] = useState<SalaMin[]>([]);
  const [novo, setNovo] = useState({ email: "", senha: "", role: "visualizador" as Papel, salas: [] as string[] });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const [{ data: perfis }, { data: papeis }, { data: us }, { data: ss }] = await Promise.all([
      supabase.from("profiles").select("id,email").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("user_salas").select("user_id,sala_id"),
      supabase.from("salas").select("id,nome").order("nome"),
    ]);
    setSalas(ss ?? []);
    setLinhas(
      (perfis ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        role: (papeis?.find((r) => r.user_id === p.id)?.role as Papel) ?? null,
        salas: (us ?? []).filter((u) => u.user_id === p.id).map((u) => u.sala_id),
      })),
    );
  }

  useEffect(() => {
    if (role === "admin") carregar();
  }, [role]);

  async function mudarPapel(id: string, papel: Papel) {
    const { error } = await supabase.from("user_roles").upsert({ user_id: id, role: papel }, { onConflict: "user_id" });
    if (error) {
      toast.error("Erro ao alterar permissão");
      return;
    }
    toast.success("Permissão atualizada");
    carregar();
  }

  async function mudarSalas(l: Linha, novas: string[]) {
    const add = novas.filter((x) => !l.salas.includes(x));
    const rem = l.salas.filter((x) => !novas.includes(x));
    if (add.length) await supabase.from("user_salas").insert(add.map((sala_id) => ({ user_id: l.id, sala_id })));
    if (rem.length) await supabase.from("user_salas").delete().eq("user_id", l.id).in("sala_id", rem);
    setLinhas((p) => p.map((x) => (x.id === l.id ? { ...x, salas: novas } : x)));
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criar({ data: { ...novo, salas: novo.role === "visualizador" ? novo.salas : [] } });
      toast.success("Usuário cadastrado");
      setNovo({ email: "", senha: "", role: "visualizador", salas: [] });
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar usuário");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;
  if (role !== "admin")
    return <p className="p-6 text-sm text-muted-foreground">Acesso restrito ao administrador.</p>;

  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link to="/departamentos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Cadastrar usuário</CardTitle>
            <CardDescription>Crie o acesso e defina a permissão. Visualizadores veem só os locais marcados.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={cadastrar} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nEmail">E-mail</Label>
                <Input id="nEmail" type="email" required value={novo.email}
                  onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nSenha">Senha (mín. 6 caracteres)</Label>
                <Input id="nSenha" type="password" required minLength={6} value={novo.senha}
                  onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nPapel">Permissão</Label>
                <select id="nPapel" className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={novo.role} onChange={(e) => setNovo({ ...novo, role: e.target.value as Papel })}>
                  {(Object.keys(NOMES) as Papel[]).map((p) => <option key={p} value={p}>{NOMES[p]}</option>)}
                </select>
              </div>
              {novo.role === "visualizador" && (
                <div className="flex flex-col gap-1.5">
                  <Label>Local(is) do visualizador</Label>
                  <SeletorSalas salas={salas} valor={novo.salas} onChange={(v) => setNovo({ ...novo, salas: v })} />
                </div>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Cadastrar usuário"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Usuários e permissões</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-44">Permissão</TableHead>
                  <TableHead className="w-64">Locais (visualizador)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.email}</TableCell>
                    <TableCell>
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={l.role ?? ""} disabled={l.id === user?.id}
                        onChange={(e) => mudarPapel(l.id, e.target.value as Papel)}>
                        <option value="" disabled>Sem permissão</option>
                        {(Object.keys(NOMES) as Papel[]).map((p) => <option key={p} value={p}>{NOMES[p]}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>
                      {l.role === "visualizador" ? (
                        <SeletorSalas salas={salas} valor={l.salas} onChange={(v) => mudarSalas(l, v)} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Todos os locais</span>
                      )}
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
