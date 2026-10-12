import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// A consulta do login fica no servidor: nunca publica o e-mail nem uma lista de usuários.
export const entrarComLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    login: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/)
      .transform((v) => v.toLowerCase()),
    senha: z.string().min(1).max(72),
  }).parse(d))
  .handler(async ({ data }) => {
    const falha = "Login ou senha inválidos";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil, error: erroPerfil } = await supabaseAdmin.from("profiles")
      .select("id").eq("login", data.login).maybeSingle();
    if (erroPerfil) throw new Error(falha);
    let email = "acesso-inexistente@login.syspatrimonio.invalid";
    if (perfil) {
      const { data: conta, error } = await supabaseAdmin.auth.admin.getUserById(perfil.id);
      if (error || !conta.user?.email) throw new Error(falha);
      email = conta.user.email;
    }
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Não foi possível acessar o serviço de autenticação");
    const { createClient } = await import("@supabase/supabase-js");
    // Cliente isolado por requisição: não compartilha sessões entre usuários no servidor.
    const auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if ((key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) &&
            headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data: resultado, error } = await auth.auth.signInWithPassword({ email, password: data.senha });
    if (error || !resultado.session || !perfil) throw new Error(falha);
    return {
      access_token: resultado.session.access_token,
      refresh_token: resultado.session.refresh_token,
    };
  });
