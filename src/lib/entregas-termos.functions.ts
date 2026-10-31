import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cpfValido, normalizarCpf } from "@/lib/cpf";

// Cliente isolado: confirmar a senha nunca substitui a sessão do navegador.
async function verificarSenha(userId: string, email: string, senha: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const cliente = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data: login, error } = await cliente.auth.signInWithPassword({ email, password: senha });
  if (error || login.user?.id !== userId) {
    throw new Error("Senha inválida. Informe a senha da sua conta conectada.");
  }
}

export const confirmarSenhaEntrega = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ senha: z.string().min(1).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conta, error } = await context.supabase.auth.getUser();
    if (error || !conta.user?.email || conta.user.id !== context.userId) {
      throw new Error("Sua sessão expirou. Entre novamente no sistema.");
    }
    await verificarSenha(context.userId, conta.user.email, data.senha);
    return { ok: true };
  });

// A proteção também existe no banco. Apenas este caminho autenticado altera
// entregas bloqueadas, depois de conferir novamente a senha e a permissão.
export const salvarEntregaConfirmada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    senha: z.string().min(1).max(72),
    importacaoId: z.string().uuid(),
    entreguePor: z.string().trim().max(200),
    recebidoPor: z.string().trim().max(200),
    cpf: z.string().max(14),
    dataEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    status: z.enum(["Entregue", "Aguardando Entrega"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conta, error: erroConta } = await context.supabase.auth.getUser();
    if (erroConta || !conta.user?.email || conta.user.id !== context.userId) {
      throw new Error("Sua sessão expirou. Entre novamente no sistema.");
    }
    await verificarSenha(context.userId, conta.user.email, data.senha);
    // Esta leitura usa as permissões do usuário, não as do administrador.
    const { data: entrega, error: erroEntrega } = await context.supabase.from("entregas_termos")
      .select("importacao_id,atualizado_em").eq("importacao_id", data.importacaoId).single();
    const { data: termo, error: erroTermo } = await context.supabase.from("importacoes")
      .select("id").eq("id", data.importacaoId).not("termo_snapshot", "is", null).single();
    if (erroEntrega || !entrega || erroTermo || !termo) {
      throw new Error("Você não tem permissão para alterar esta entrega.");
    }
    if (data.status === "Entregue" && (!data.entreguePor || !data.recebidoPor || !data.cpf || !data.dataEntrega)) {
      throw new Error("Preencha todos os campos para registrar o termo como Entregue.");
    }
    if (data.cpf.trim() && !cpfValido(data.cpf)) throw new Error("Informe um CPF válido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registro, error } = await supabaseAdmin.from("entregas_termos").update({
      entregue_por: data.entreguePor, recebido_por: data.recebidoPor,
      cpf: normalizarCpf(data.cpf), data_entrega: data.dataEntrega, status: data.status,
      atualizado_em: new Date().toISOString(),
    }).eq("importacao_id", data.importacaoId).eq("atualizado_em", entrega.atualizado_em).select("*").single();
    if (error || !registro) throw new Error("Não foi possível salvar. Reabra o termo e tente novamente.");
    return registro;
  });
