import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { Papel } from "@/hooks/use-role";
import { editarUsuario, excluirUsuario, mudarSenhaUsuario } from "@/lib/gerenciar-usuarios.functions";
import { cpfValido, formatarCpf } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

export type UsuarioGerenciavel = {
  id: string; nome: string | null; cpf: string | null; email: string | null; role: Papel | null;
  login?: string | null; matricula?: string | null;
};
const PAPEIS: Record<Papel, string> = { admin: "Administrador", operador: "Operador", visualizador: "Visualizador" };

export function GerenciarUsuarios({ usuarios, usuarioAtualId, onAtualizar }: {
  usuarios: UsuarioGerenciavel[];
  usuarioAtualId?: string | undefined;
  onAtualizar: () => Promise<void>;
}) {
  const editar = useServerFn(editarUsuario);
  const excluir = useServerFn(excluirUsuario);
  const mudarSenha = useServerFn(mudarSenhaUsuario);
  const [busca, setBusca] = useState("");
  const [id, setId] = useState("");
  const [modo, setModo] = useState<"editar" | "senha" | null>(null);
  const [dados, setDados] = useState({ nome: "", cpf: "", email: "", login: "", matricula: "", role: "visualizador" as Papel });
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const selecionado = usuarios.find((u) => u.id === id);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const encontrados = usuarios.filter((u) =>
    `${u.nome ?? ""} ${u.email ?? ""} ${u.login ?? ""} ${u.matricula ?? ""} ${u.cpf ?? ""} ${formatarCpf(u.cpf ?? "")}`.toLocaleLowerCase("pt-BR").includes(termo));
  const opcoes = selecionado && !encontrados.some((u) => u.id === id) ? [selecionado, ...encontrados] : encontrados;

  function limparModo() { setModo(null); setSenha(""); setConfirmacao(""); }
  function abrirEdicao() {
    if (!selecionado) return;
    setDados({ nome: selecionado.nome ?? "", cpf: formatarCpf(selecionado.cpf ?? ""),
      email: selecionado.email ?? "", login: selecionado.login ?? "", matricula: selecionado.matricula ?? "",
      role: selecionado.role ?? "visualizador" });
    limparModo(); setModo("editar");
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado || ocupado) return;
    if (!cpfValido(dados.cpf)) { toast.error("Informe um CPF válido"); return; }
    setOcupado(true);
    try {
      await editar({ data: { id, ...dados } });
      limparModo();
      toast.success("Usuário atualizado");
      await onAtualizar();
    } catch (erro) { toast.error(erro instanceof Error ? erro.message : "Não foi possível editar o usuário"); }
    finally { setOcupado(false); }
  }
  async function salvarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado || ocupado) return;
    if (senha !== confirmacao) { toast.error("As senhas não coincidem"); return; }
    setOcupado(true);
    try {
      await mudarSenha({ data: { id, senha } });
      limparModo(); toast.success("Senha alterada. Informe a nova senha ao usuário por um canal seguro.");
    } catch (erro) { toast.error(erro instanceof Error ? erro.message : "Não foi possível mudar a senha"); }
    finally { setOcupado(false); }
  }
  async function remover() {
    if (!selecionado || ocupado) return;
    setOcupado(true);
    try {
      await excluir({ data: { id } });
      setId(""); limparModo(); setConfirmarExclusao(false);
      toast.success("Usuário excluído"); await onAtualizar();
    } catch (erro) { toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir o usuário"); }
    finally { setOcupado(false); }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Gerenciar usuários</CardTitle>
        <CardDescription>Localize um usuário para editar os dados, excluir o acesso ou mudar a senha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="buscaUsuario">Buscar usuário</Label>
          <Input id="buscaUsuario" placeholder="Nome, CPF ou e-mail" value={busca} disabled={ocupado}
            onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="usuarioGerenciado">Usuário</Label>
          <select id="usuarioGerenciado" className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
            value={id} disabled={ocupado} onChange={(e) => { setId(e.target.value); limparModo(); }}>
            <option value="">Selecione um usuário</option>
            {opcoes.map((u) => <option key={u.id} value={u.id}>{u.nome || u.email || "Nome não informado"}{u.email && u.nome ? ` — ${u.email}` : ""}</option>)}
          </select>
          {!encontrados.length && <p className="text-sm text-muted-foreground">Nenhum usuário encontrado para essa busca.</p>}
        </div>
        {selecionado && <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="break-words font-medium">{selecionado.nome || "Nome não informado"}</p>
          <p className="break-all">{selecionado.email}</p>
          <p className="text-muted-foreground">CPF: {selecionado.cpf ? formatarCpf(selecionado.cpf) : "Não informado"}</p>
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!selecionado || ocupado} onClick={abrirEdicao}>
            <Pencil className="mr-2 h-4 w-4" /> Editar usuário
          </Button>
          <Button type="button" variant="destructive" disabled={!selecionado || ocupado || id === usuarioAtualId}
            onClick={() => setConfirmarExclusao(true)}><Trash2 className="mr-2 h-4 w-4" /> Excluir usuário</Button>
        </div>
        <Button type="button" variant="link" className="h-auto px-0" disabled={!selecionado || ocupado}
          onClick={() => { limparModo(); setModo("senha"); }}>Mudar de senha</Button>
        {selecionado && id === usuarioAtualId && <p className="text-xs text-muted-foreground">Por segurança, você não pode excluir sua própria conta nem remover sua permissão de administrador.</p>}
        {selecionado && modo === "editar" && (
          <form onSubmit={salvar} className="border-t pt-4">
            <fieldset disabled={ocupado} className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 font-medium">Editar dados do usuário</legend>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="editarNome">Nome completo</Label>
                <Input id="editarNome" required minLength={3} maxLength={200} value={dados.nome}
                  onChange={(e) => setDados({ ...dados, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editarCpf">CPF</Label>
                <Input id="editarCpf" required inputMode="numeric" maxLength={14} value={dados.cpf}
                  onChange={(e) => setDados({ ...dados, cpf: formatarCpf(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editarPapel">Permissão</Label>
                <select id="editarPapel" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={dados.role} disabled={id === usuarioAtualId}
                  onChange={(e) => setDados({ ...dados, role: e.target.value as Papel })}>
                  {(Object.keys(PAPEIS) as Papel[]).map((p) => <option key={p} value={p}>{PAPEIS[p]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editarMatricula">Matrícula</Label>
                <Input id="editarMatricula" maxLength={50} value={dados.matricula}
                  onChange={(e) => setDados({ ...dados, matricula: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editarLogin">Login</Label>
                <Input id="editarLogin" minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\\-]+"
                  required={!dados.email} value={dados.login}
                  onChange={(e) => setDados({ ...dados, login: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="editarEmail">E-mail de acesso (opcional com login)</Label>
                <Input id="editarEmail" type="email" required={!dados.login} maxLength={255} value={dados.email}
                  onChange={(e) => setDados({ ...dados, email: e.target.value })} />
                <p className="text-xs text-muted-foreground">Você pode usar login e senha sem e-mail. Ao mudar o e-mail, o novo endereço também poderá ser usado para entrar.</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit">{ocupado ? "Salvando..." : "Salvar alterações"}</Button>
                <Button type="button" variant="outline" onClick={limparModo}>Cancelar</Button>
              </div>
            </fieldset>
          </form>
        )}
        {selecionado && modo === "senha" && (
          <form onSubmit={salvarSenha} className="border-t pt-4">
            <fieldset disabled={ocupado} className="space-y-4">
              <legend className="mb-3 font-medium">Mudar de senha</legend>
              <p className="text-sm text-muted-foreground">Defina uma nova senha para o usuário selecionado e comunique-a por um canal seguro.</p>
              <div className="space-y-1.5">
                <Label htmlFor="novaSenhaUsuario">Nova senha</Label>
                <Input id="novaSenhaUsuario" type="password" autoComplete="new-password" required minLength={6} maxLength={72}
                  value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmarSenhaUsuario">Confirmar nova senha</Label>
                <Input id="confirmarSenhaUsuario" type="password" autoComplete="new-password" required minLength={6} maxLength={72}
                  value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{ocupado ? "Salvando..." : "Salvar nova senha"}</Button>
                <Button type="button" variant="outline" onClick={limparModo}>Cancelar</Button>
              </div>
            </fieldset>
          </form>
        )}
        <AlertDialog open={confirmarExclusao} onOpenChange={(aberto) => { if (!ocupado) setConfirmarExclusao(aberto); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
              <AlertDialogDescription>
                O acesso de {selecionado?.nome || selecionado?.email || "este usuário"} e seus vínculos de acesso aos locais serão excluídos definitivamente. Os bens, salas e departamentos cadastrados serão preservados. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={ocupado} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); void remover(); }}>
                {ocupado ? "Excluindo..." : "Confirmar exclusão"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
