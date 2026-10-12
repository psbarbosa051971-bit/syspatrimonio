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
        matricula: z.string().trim().max(50).default(""),
        login: z.string().trim().min(3, "Informe um login com pelo menos 3 caracteres").max(50)
          .regex(/^[a-zA-Z0-9._-]+$/, "Use letras, números, ponto, hífen ou sublinhado no login")
          .transform((v) => v.toLowerCase()),
        email: z.union([z.string().trim().email().max(255), z.literal("")]).default(""),
        senha: z.string().min(6).max(72),
        role: z.enum(["admin", "operador", "visualizador"]),
        unidade: z.enum(["CENTRAL", "SAÚDE", "EDUCAÇÃO"], { message: "Selecione a Unidade" }),
        salas: z.array(z.string().uuid()).length(1, "Selecione o Local Físico do usuário"),
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
    const { data: local, error: erroLocal } = await supabaseAdmin.from("salas")
      .select("id,unidade").eq("id", data.salas[0]!).single();
    if (erroLocal || !local) throw new Error("Selecione um Local Físico válido");
    if (local.unidade && local.unidade !== data.unidade) {
      throw new Error("O Local Físico pertence a outra unidade. Atualize a lista e selecione novamente.");
    }
    const { data: existente, error: erroConsulta } = await supabaseAdmin
      .from("profiles").select("id").eq("cpf", data.cpf).maybeSingle();
    if (erroConsulta) throw new Error("Não foi possível verificar o CPF");
    if (existente) throw new Error("Já existe um usuário com esse CPF");
    const { data: loginExistente, error: erroLogin } = await supabaseAdmin
      .from("profiles").select("id").eq("login", data.login).maybeSingle();
    if (erroLogin) throw new Error("Não foi possível verificar o login");
    if (loginExistente) throw new Error("Este login já está em uso");
    // Endereço interno apenas para o mecanismo de autenticação; não é e-mail de contato.
    const emailAutenticacao = data.email || `${crypto.randomUUID()}@login.syspatrimonio.invalid`;
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: emailAutenticacao,
      password: data.senha,
      email_confirm: true,
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Erro ao criar usuário");
    const id = criado.user.id;
    try {
      const { error: erroPerfil } = await supabaseAdmin.from("profiles")
        .upsert({ id, email: data.email || null, nome: data.nome, cpf: data.cpf,
          matricula: data.matricula || null, login: data.login });
      if (erroPerfil) throw erroPerfil;
      const { error: erroPapel } = await supabaseAdmin.from("user_roles")
        .upsert({ user_id: id, role: data.role }, { onConflict: "user_id" });
      if (erroPapel) throw erroPapel;
      if (data.salas.length) {
        const { error: erroSalas } = await supabaseAdmin.from("user_salas")
          .insert(data.salas.map((sala_id) => ({ user_id: id, sala_id })));
        if (erroSalas) throw erroSalas;
        const { error: erroResponsavel } = await supabaseAdmin.from("salas")
          .update({ responsavel: data.nome, unidade: data.unidade })
          .eq("id", data.salas[0]!).or(`unidade.is.null,unidade.eq.${data.unidade}`)
          .select("id").single();
        if (erroResponsavel) throw erroResponsavel;
      }
    } catch {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error("Não foi possível salvar o cadastro e os locais. Confira o CPF e tente novamente.");
    }
    return { id };
  });

export const responsavelDoLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ salaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: permitido, error: erroPermissao } = await context.supabase.rpc("can_edit", { _user_id: context.userId });
    if (erroPermissao || !permitido) throw new Error("Acesso não autorizado");
    const { data: sala, error: erroSala } = await context.supabase.from("salas").select("id").eq("id", data.salaId).single();
    if (erroSala || !sala) throw new Error("Local não encontrado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vinculos, error } = await supabaseAdmin.from("user_salas").select("user_id").eq("sala_id", sala.id);
    if (error) throw new Error("Não foi possível consultar o responsável");
    if (!vinculos?.length) return null;
    const { data: perfil, error: erroPerfil } = await supabaseAdmin.from("profiles").select("nome,cpf,matricula")
      .in("id", vinculos.map((v) => v.user_id)).not("nome", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (erroPerfil) throw new Error("Não foi possível consultar o responsável");
    return perfil;
  });
