import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRole, type Papel } from "@/hooks/use-role";
import { criarUsuario } from "@/lib/usuarios.functions";
import { cpfValido, formatarCpf } from "@/lib/cpf";
import { SeletorLocalFisico, type LocalFisicoOpcao } from "@/components/SeletorLocalFisico";
import { GerenciarUsuarios } from "@/components/GerenciarUsuarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  validateSearch: (search: Record<string, unknown>): { salaId?: string } => (
    typeof search["salaId"] === "string" && search["salaId"].length <= 100
      ? { salaId: search["salaId"] }
      : {}
  ),
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

type Linha = { id: string; nome: string | null; cpf: string | null; email: string | null; matricula: string | null; login: string | null; role: Papel | null; salas: string[] };
type SalaMin = LocalFisicoOpcao;
const UNIDADES = ["CENTRAL", "SAÚDE", "EDUCAÇÃO"] as const;

const NOMES: Record<Papel, string> = {
  admin: "Administrador",
  operador: "Operador",
  visualizador: "Visualizador",
};

const SeletorSalas = SeletorLocalFisico;

function UsuariosPage() {
  const { salaId } = Route.useSearch();
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const { user } = useAuth();
  const { role, loading } = useRole();
  const criar = useServerFn(criarUsuario);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [salas, setSalas] = useState<SalaMin[]>([]);
  const [novo, setNovo] = useState({ nome: "", matricula: "", cpf: "", email: "", login: "", senha: "", role: "visualizador" as Papel, unidade: "", salas: [] as string[] });
  const [salvando, setSalvando] = useState(false);
  const locaisDaUnidade = novo.unidade ? salas.filter((s) => !s.unidade || s.unidade === novo.unidade) : [];

  async function carregar() {
    const [{ data: perfis }, { data: papeis }, { data: us }, { data: ss }] = await Promise.all([
      supabase.from("profiles").select("id,email,nome,cpf,matricula,login").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("user_salas").select("user_id,sala_id"),
      supabase.from("salas").select("id,nome,unidade").order("nome"),
    ]);
    setSalas(ss ?? []);
    setLinhas(
      (perfis ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        cpf: p.cpf,
        email: p.email,
        matricula: p.matricula,
        login: p.login,
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
    if (add.length) {
      const { error } = await supabase.from("user_salas").insert(add.map((sala_id) => ({ user_id: l.id, sala_id })));
      if (error) { toast.error("Não foi possível vincular o local"); return; }
    }
    if (rem.length) {
      const { error } = await supabase.from("user_salas").delete().eq("user_id", l.id).in("sala_id", rem);
      if (error) { toast.error("Não foi possível remover o vínculo anterior"); carregar(); return; }
    }
    setLinhas((p) => p.map((x) => (x.id === l.id ? { ...x, salas: novas } : x)));
    toast.success("Local Físico atualizado");
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    if (!cpfValido(novo.cpf)) { toast.error("Informe um CPF válido"); return; }
    setSalvando(true);
    try {
      const unidade = UNIDADES.find((u) => u === novo.unidade);
      if (!unidade) throw new Error("Selecione a Unidade do usuário");
      if (!novo.salas.length || !locaisDaUnidade.some((s) => s.id === novo.salas[0])) {
        throw new Error("Selecione um Local Físico da lista");
      }
      await criar({ data: { ...novo, unidade } });
      toast.success("Usuário cadastrado e Local Físico vinculado à unidade");
      setMostrarSenha(false);
      setNovo({ nome: "", matricula: "", cpf: "", email: "", login: "", senha: "", role: "visualizador", unidade: "", salas: [] });
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
    <div className="min-h-screen bg-muted/40 p-3 sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link to="/departamentos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>

        <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Cadastrar usuário</CardTitle>
            <CardDescription>Crie o acesso, defina a permissão e vincule o usuário ao Local Físico. Visualizadores veem somente o local vinculado.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={cadastrar} className="cadastro-usuario grid gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-3">
                <Label htmlFor="nNome">Nome completo do usuário</Label>
                <Input id="nNome" required minLength={3} maxLength={200} autoComplete="name" value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nMatricula">Matrícula</Label>
                <Input id="nMatricula" maxLength={50} value={novo.matricula}
                  onChange={(e) => setNovo({ ...novo, matricula: e.target.value })} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nCpf">CPF</Label>
                <Input id="nCpf" required inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={novo.cpf}
                  onChange={(e) => setNovo({ ...novo, cpf: formatarCpf(e.target.value) })} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nEmail">E-mail (opcional)</Label>
                <Input id="nEmail" type="email" maxLength={255} autoComplete="email" value={novo.email}
                  onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-3">
                <Label htmlFor="nLogin">Login (nome de usuário)</Label>
                <Input id="nLogin" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\\-]+"
                  autoComplete="username" placeholder="Ex.: PSBARBOSA" value={novo.login}
                  onChange={(e) => setNovo({ ...novo, login: e.target.value })} />
                <p className="text-xs text-muted-foreground">Use letras, números, ponto, hífen ou sublinhado. Você poderá entrar com esse login e a senha, sem informar e-mail.</p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nSenha">Senha (mín. 6 caracteres)</Label>
                <div className="relative">
                  <Input id="nSenha" type={mostrarSenha ? "text" : "password"} className="pr-10" required minLength={6} maxLength={72} autoComplete="new-password" value={novo.senha}
                    onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
                  <Button type="button" variant="outline" size="icon" className="absolute right-1 top-1 h-7 w-7"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} aria-pressed={mostrarSenha}
                    onClick={() => setMostrarSenha((valor) => !valor)}>
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nPapel">Permissão</Label>
                <select id="nPapel" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={novo.role} onChange={(e) => setNovo({ ...novo, role: e.target.value as Papel })}>
                  {(Object.keys(NOMES) as Papel[]).map((p) => <option key={p} value={p}>{NOMES[p]}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nUnidade">Unidade</Label>
                <select id="nUnidade" required className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value, salas: [] })}>
                  <option value="">Selecione a Unidade</option>
                  {UNIDADES.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-3">
                <Label htmlFor="nLocal">Selecione o Local Físico (lotação)</Label>
                <SeletorSalas key={novo.unidade} id="nLocal" required limparAoDigitar disabled={!novo.unidade} salas={locaisDaUnidade}
                  valor={novo.salas} onChange={(v) => setNovo({ ...novo, salas: v })} />
                <p className="text-xs text-muted-foreground">Selecione a Unidade e digite parte do nome ou número, como 200 ou ALEX. Clique em um resultado para selecionar.</p>
                <p className="text-xs text-muted-foreground">Locais ainda sem unidade também aparecem. Ao cadastrar o usuário, o local escolhido será vinculado à unidade selecionada.</p>
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Cadastrar usuário"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <GerenciarUsuarios usuarios={linhas} salas={salas} salaInicialId={salaId} usuarioAtualId={user?.id} onAtualizar={carregar} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Usuários e permissões</CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[960px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Nome, matrícula, login, CPF e e-mail</TableHead>
                  <TableHead className="w-44">Permissão</TableHead>
                  <TableHead>Local Físico vinculado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="font-medium">{l.nome || "Nome não informado"}</p>
                      <p className="text-xs">Matrícula: {l.matricula || "Não informada"} · Login: {l.login || "Não informado"}</p>
                      <p>{l.email || "Sem e-mail cadastrado"}</p>
                      <p className="text-xs text-muted-foreground">CPF: {l.cpf ? formatarCpf(l.cpf) : "Não informado"}</p>
                    </TableCell>
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
                        <>
                          <SeletorSalas salas={salas} valor={l.salas} onChange={(v) => mudarSalas(l, v)} />
                          <p className="mt-1 whitespace-normal break-words text-sm text-muted-foreground">
                            {salas.filter((s) => l.salas.includes(s.id)).map((s) => s.nome).join("; ") || "Sem local vinculado"}
                          </p>
                          {l.salas.length > 1 && <p className="mt-1 text-xs text-muted-foreground">Selecionar outro local substitui os vínculos existentes.</p>}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {salas.filter((s) => l.salas.includes(s.id)).map((s) => s.nome).join("; ") || "Sem local vinculado"}
                          <span className="block">Acesso a todos os locais pela permissão.</span>
                        </span>
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
