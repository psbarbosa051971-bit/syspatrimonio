import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RedefinirSenha() {
  const [estado, setEstado] = useState<"carregando" | "pronto" | "invalido" | "salvo">("carregando");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const linkComErro = url.searchParams.has("error") || hash.has("error") || hash.has("error_code");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (!ativo || linkComErro) return;
      if (evento === "PASSWORD_RECOVERY") setEstado("pronto");
      if (evento === "SIGNED_OUT") setEstado((anterior) => anterior === "salvo" ? anterior : "invalido");
    });
    // getSession aguarda o processamento do link pelo cliente de autenticação.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!ativo) return;
      setEstado(!linkComErro && !error && data.session ? "pronto" : "invalido");
    }).catch(() => { if (ativo) setEstado("invalido"); });
    return () => { ativo = false; subscription.unsubscribe(); };
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando || estado !== "pronto") return;
    setErro("");
    if (senha.length < 6) { setErro("Use uma senha com pelo menos 6 caracteres."); return; }
    if (senha !== confirmacao) { setErro("As senhas não coincidem."); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        if (["session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(error.code ?? "") || error.status === 401 || error.status === 403) {
          setEstado("invalido");
        } else {
          setErro(error.code === "same_password"
            ? "Escolha uma senha diferente da anterior."
            : "Não foi possível salvar. Use uma senha mais forte e tente novamente; se persistir, solicite um novo link.");
        }
        return;
      }
      setSenha("");
      setConfirmacao("");
      setEstado("salvo");
      // O link já foi consumido; remova seus dados da barra de endereço.
      window.history.replaceState(null, "", window.location.pathname);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } catch {
      setErro("Não foi possível salvar agora. Confira sua conexão e tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  if (estado === "carregando") return <p role="status" className="text-sm text-muted-foreground">Verificando link de recuperação...</p>;
  if (estado === "invalido") return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-sm text-destructive">O link é inválido, expirou ou já foi utilizado. Volte à tela de login e solicite um novo link em Esqueci minha senha.</p>
      <Button asChild variant="outline"><a href="/entrar">Voltar para entrar</a></Button>
    </div>
  );
  if (estado === "salvo") return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm">Senha atualizada com sucesso. Entre usando sua nova senha.</p>
      <Button asChild><a href="/entrar">Voltar para entrar</a></Button>
    </div>
  );
  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Crie uma nova senha com pelo menos 6 caracteres.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nova-senha">Nova senha</Label>
        <Input id="nova-senha" type="password" autoComplete="new-password" required minLength={6}
          value={senha} onChange={(e) => setSenha(e.target.value)} disabled={salvando} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
        <Input id="confirmar-senha" type="password" autoComplete="new-password" required minLength={6}
          value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} disabled={salvando} />
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar nova senha"}</Button>
    </form>
  );
}
