import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cpfValido, normalizarCpf } from "@/lib/cpf";

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nome: z.string().trim().min(3, "Informe o nome completo").max(200),
        cpf: z.string().transform(normalizarCpf).refine(cpfValido, "CPF inválido"),
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
    const { data: existente, error: erroConsulta } = await supabaseAdmin
      .from("profiles").select("id").eq("cpf", data.cpf).maybeSingle();
    if (erroConsulta) throw new Error("Não foi possível verificar o CPF");
    if (existente) throw new Error("Já existe um usuário com esse CPF");
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Erro ao criar usuário");
    const id = criado.user.id;
    try {
      const { error: erroPerfil } = await supabaseAdmin.from("profiles")
        .upsert({ id, email: data.email, nome: data.nome, cpf: data.cpf });
      if (erroPerfil) throw erroPerfil;
      const { error: erroPapel } = await supabaseAdmin.from("user_roles")
        .upsert({ user_id: id, role: data.role }, { onConflict: "user_id" });
      if (erroPapel) throw erroPapel;
      if (data.role === "visualizador" && data.salas.length) {
        const { error: erroSalas } = await supabaseAdmin.from("user_salas")
          .insert(data.salas.map((sala_id) => ({ user_id: id, sala_id })));
        if (erroSalas) throw erroSalas;
      }
    } catch {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error("Não foi possível salvar o cadastro e os locais. Confira o CPF e tente novamente.");
    }
    return { id };
  });
