import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cpfValido, normalizarCpf } from "@/lib/cpf";

export const editarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    nome: z.string().trim().min(3, "Informe o nome completo").max(200),
    cpf: z.string().transform(normalizarCpf).refine(cpfValido, "CPF inválido"),
    email: z.union([z.string().trim().email().max(255), z.literal("")]),
    matricula: z.string().trim().max(50).optional(),
    login: z.union([z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/)
      .transform((v) => v.toLowerCase()), z.literal("")]).optional(),
    role: z.enum(["admin", "operador", "visualizador"]),
    salas: z.array(z.string().uuid()).min(1, "Selecione o Local Físico do usuário").max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error: erroAcesso } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (erroAcesso || !admin) throw new Error("Apenas administradores podem editar usuários");
    if (data.id === context.userId && data.role !== "admin") {
      throw new Error("Você não pode remover sua própria permissão de administrador");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: anterior, error: erroPerfil } = await supabaseAdmin.from("profiles")
      .select("id,nome,cpf,email,login,matricula").eq("id", data.id).single();
    if (erroPerfil || !anterior) throw new Error("Usuário não encontrado. Atualize a lista.");
    const locais = data.salas ? [...new Set(data.salas)] : undefined;
    let locaisAnteriores: string[] = [];
    if (locais) {
      const [{ data: existentes, error: erroLocais }, { data: vinculos, error: erroVinculos }] = await Promise.all([
        supabaseAdmin.from("salas").select("id").in("id", locais),
        supabaseAdmin.from("user_salas").select("sala_id").eq("user_id", data.id),
      ]);
      if (erroLocais || erroVinculos) throw new Error("Não foi possível verificar a lotação. Tente novamente.");
      if (existentes?.length !== locais.length) throw new Error("Selecione um Local Físico válido da lista");
      locaisAnteriores = (vinculos ?? []).map((v) => v.sala_id);
    }
    const { data: duplicado, error: erroCpf } = await supabaseAdmin.from("profiles")
      .select("id").eq("cpf", data.cpf).neq("id", data.id).maybeSingle();
    if (erroCpf) throw new Error("Não foi possível verificar o CPF");
    if (duplicado) throw new Error("Já existe outro usuário com esse CPF");
    const login = data.login === undefined ? anterior.login : data.login || null;
    const matricula = data.matricula === undefined ? anterior.matricula : data.matricula || null;
    if (!data.email && !login) throw new Error("Informe um login ou e-mail para manter o acesso do usuário");
    if (login) {
      const { data: outro, error } = await supabaseAdmin.from("profiles")
        .select("id").eq("login", login).neq("id", data.id).maybeSingle();
      if (error) throw new Error("Não foi possível verificar o login");
      if (outro) throw new Error("Este login já está em uso");
    }
    const { data: conta, error: erroConta } = await supabaseAdmin.auth.admin.getUserById(data.id);
    if (erroConta || !conta.user) throw new Error("Não foi possível localizar o acesso do usuário");
    const emailAutenticacao = data.email || (anterior.email
      ? `${crypto.randomUUID()}@login.syspatrimonio.invalid` : conta.user.email);
    if (!emailAutenticacao) throw new Error("Não foi possível localizar o acesso do usuário");
    const { error: erroEmail } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      email: emailAutenticacao, email_confirm: true,
    });
    if (erroEmail) throw new Error("Não foi possível atualizar o e-mail. Verifique se ele já está em uso.");
    const { error: erroSalvar } = await supabaseAdmin.from("profiles")
      .update({ nome: data.nome, cpf: data.cpf, email: data.email || null, login, matricula }).eq("id", data.id);
    if (erroSalvar) {
      if (conta.user.email) await supabaseAdmin.auth.admin.updateUserById(data.id, { email: conta.user.email, email_confirm: true });
      throw new Error("Não foi possível salvar os dados. Verifique o CPF e tente novamente.");
    }
    const { error: erroPapel } = await supabaseAdmin.from("user_roles")
      .upsert({ user_id: data.id, role: data.role }, { onConflict: "user_id" });
    if (erroPapel) {
      await supabaseAdmin.from("profiles").update({ nome: anterior.nome, cpf: anterior.cpf, email: anterior.email,
        login: anterior.login, matricula: anterior.matricula }).eq("id", data.id);
      if (conta.user.email) await supabaseAdmin.auth.admin.updateUserById(data.id, { email: conta.user.email, email_confirm: true });
      throw new Error("Não foi possível atualizar a permissão. Recarregue a lista antes de tentar novamente.");
    }
    if (locais) {
      const adicionar = locais.filter((salaId) => !locaisAnteriores.includes(salaId));
      const remover = locaisAnteriores.filter((salaId) => !locais.includes(salaId));
      if (adicionar.length) {
        const { error } = await supabaseAdmin.from("user_salas")
          .insert(adicionar.map((sala_id) => ({ user_id: data.id, sala_id })));
        if (error) throw new Error("Os dados foram salvos, mas não foi possível atualizar a lotação. Atualize a lista e tente novamente.");
      }
      if (remover.length) {
        const { error } = await supabaseAdmin.from("user_salas").delete()
          .eq("user_id", data.id).in("sala_id", remover);
        if (error) {
          if (adicionar.length) await supabaseAdmin.from("user_salas").delete()
            .eq("user_id", data.id).in("sala_id", adicionar);
          throw new Error("Os dados foram salvos, mas não foi possível substituir a lotação anterior. Atualize a lista e tente novamente.");
        }
      }
    }
    return { sucesso: true };
  });

export const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error: erroAcesso } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (erroAcesso || !admin) throw new Error("Apenas administradores podem excluir usuários");
    if (data.id === context.userId) throw new Error("Você não pode excluir a própria conta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error("Não foi possível excluir o usuário. Atualize a lista e tente novamente.");
    return { sucesso: true };
  });

export const mudarSenhaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres").max(72),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error: erroAcesso } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (erroAcesso || !admin) throw new Error("Apenas administradores podem mudar senhas");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.senha });
    if (error) throw new Error("Não foi possível mudar a senha. Use uma senha diferente com pelo menos 6 caracteres.");
    return { sucesso: true };
  });
