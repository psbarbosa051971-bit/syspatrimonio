import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/criar-conta")({
  head: () => ({
    meta: [
      { title: "Criar conta — SysPatrimônio" },
      {
        name: "description",
        content: "Crie sua conta no SysPatrimônio para gerenciar o patrimônio.",
      },
      { property: "og:title", content: "Criar conta — SysPatrimônio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CriarConta,
});

function CriarConta() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== confirmar) {
      toast.error("As senhas não coincidem");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: window.location.origin },
    });
    setCarregando(false);
    if (error) {
      toast.error("Não foi possível criar a conta", {
        description: error.message,
      });
      return;
    }
    setEnviado(true);
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Erro ao entrar com Google");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">Criar conta</CardTitle>
          <CardDescription>Cadastre-se para usar o SysPatrimônio</CardDescription>
        </CardHeader>
        <CardContent>
          {enviado ? (
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Quase lá!</p>
              <p className="mt-2">
                Enviamos um link de confirmação para <strong>{email}</strong>.
                Confirme o e-mail e depois faça login.
              </p>
              <Button asChild className="mt-4 w-full" variant="outline">
                <Link to="/entrar">Ir para Entrar</Link>
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    required
                    minLength={6}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirmar">Confirmar senha</Label>
                  <Input
                    id="confirmar"
                    type="password"
                    required
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={carregando}>
                  {carregando ? "Criando..." : "Criar conta"}
                </Button>
              </form>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                ou
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
              >
                Continuar com Google
              </Button>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/entrar" className="font-medium text-primary underline">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
