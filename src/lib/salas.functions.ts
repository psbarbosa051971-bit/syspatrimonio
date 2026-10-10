import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const excluirSala = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        salaId: z.string().uuid(),
        email: z.string().email().max(255),
        senha: z.string().min(1).max(72),
      })
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
    await supabaseAdmin.from("user_salas").delete().eq("sala_id", data.salaId);
    await supabaseAdmin.from("bens").delete().eq("sala_id", data.salaId);
    const { error: e2 } = await supabaseAdmin.from("salas").delete().eq("id", data.salaId);
    if (e2) throw new Error("Erro ao excluir sala");
    return { ok: true };
  });
