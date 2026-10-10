import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const excluirImportacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        salaId: z.string().uuid(),
        modo: z.enum(["uma", "todas", "anteriores"]),
        importacaoId: z.string().uuid().optional(),
        email: z.string().email().max(255),
        senha: z.string().min(1).max(72),
      })
      .refine((v) => v.modo !== "uma" || !!v.importacaoId, "Selecione uma importação")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
    const pub = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: login, error } = await pub.auth.signInWithPassword({
      email: data.email,
      password: data.senha,
    });
    if (error || !login.user) throw new Error("Senha do administrador inválida");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: papel } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", login.user.id).eq("role", "admin").maybeSingle();
    if (!papel) throw new Error("Esta conta não é de administrador");
    const { error: exclusaoErro } = await supabaseAdmin.rpc("excluir_importacoes_sala", {
      _sala_id: data.salaId,
      _modo: data.modo,
      ...(data.importacaoId ? { _importacao_id: data.importacaoId } : {}),
    });
    if (exclusaoErro) throw new Error("Não foi possível excluir os registros selecionados. Atualize a lista e tente novamente.");
    return { ok: true };
  });
