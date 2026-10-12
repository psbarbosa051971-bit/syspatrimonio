import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RecuperarSenha({ emailInicial = "", onVoltar }: {
  emailInicial?: string;
  onVoltar: () => void;
}) {
  const [email, setEmail] = useState(emailInicial.includes("@") ? emailInicial : "");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      setEnviado(true);
    } catch {
      setErro("Não foi possível solicitar a recuperação agora. Aguarde alguns minutos e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Informe o e-mail cadastrado na sua conta para receber um link de recuperação.
      </p>
      {enviado ? (
        <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
          Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.
          Verifique também a pasta de spam. Abra o link mais recente recebido.
        </p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email-recuperacao">E-mail cadastrado</Label>
            <Input id="email-recuperacao" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com" disabled={enviando} />
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <Button type="submit" disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar link de recuperação"}
          </Button>
        </form>
      )}
      <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
        <strong>Não tem e-mail cadastrado ou perdeu o acesso a ele?</strong>{" "}
        Solicite ao administrador do SysPatrimônio a redefinição da senha.
        Informe seu login ou matrícula para identificar a conta.
      </p>
      <Button type="button" variant="outline" onClick={onVoltar} disabled={enviando}>
        Voltar para entrar
      </Button>
    </div>
  );
}
