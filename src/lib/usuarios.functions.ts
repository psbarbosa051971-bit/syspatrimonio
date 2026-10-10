import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(255),
        senha: z.string().min(6).max(72),
        role: z.enum(["admin", "operador", "visualizador"]),
        salas: z.array(z.string().uuid()).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ehAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!ehAdmin) throw new Error("Apenas administradores podem cadastrar usuários");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Erro ao criar usuário");
    const id = criado.user.id;
    await supabaseAdmin.from("user_roles").upsert({ user_id: id, role: data.role }, { onConflict: "user_id" });
    if (data.salas.length)
      await supabaseAdmin.from("user_salas").insert(data.salas.map((sala_id) => ({ user_id: id, sala_id })));
    return { id };
  });
