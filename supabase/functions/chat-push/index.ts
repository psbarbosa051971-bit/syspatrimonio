// Executado no servidor: as chaves privadas nunca são enviadas ao navegador.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

function endpointPermitido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      (!url.port || url.port === "443") && (
        url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".notify.windows.com")
      );
  } catch { return false; }
}

async function configuracao() {
  const { data, error } = await db.from("chat_push_config").select("*").eq("id", true).single();
  if (error) throw error;
  if (data.vapid_public_key && data.vapid_private_key) return data;
  const keys = webpush.generateVAPIDKeys();
  // Apenas a primeira requisição grava as chaves; as demais leem o mesmo par.
  const { error: updateError } = await db.from("chat_push_config").update({
    vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey,
  }).eq("id", true).is("vapid_public_key", null);
  if (updateError) throw updateError;
  const { data: saved, error: readError } = await db.from("chat_push_config").select("*").eq("id", true).single();
  if (readError) throw readError;
  return saved;
}

async function despachar(messageId: number, config: Awaited<ReturnType<typeof configuracao>>) {
  const { data: message, error } = await db.from("chat_mensagens")
    .select("id, conversa_id, autor_id").eq("id", messageId).maybeSingle();
  if (error) throw error;
  if (!message) return;
  const { data: roles, error: rolesError } = await db.from("user_roles")
    .select("user_id, role").in("role", ["admin", "operador", "visualizador"]);
  if (rolesError) throw rolesError;
  const autorAdmin = roles?.some((r) => r.user_id === message.autor_id && r.role === "admin");
  const recipients = autorAdmin
    ? (roles ?? []).filter((r) => r.user_id === message.conversa_id && r.role !== "admin").map((r) => r.user_id)
    : (roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id);
  const ids = [...new Set(recipients)].filter((id) => id !== message.autor_id);
  if (!ids.length) return;
  const { data: subscriptions, error: subError } = await db.from("chat_push_assinaturas")
    .select("endpoint, p256dh, auth").in("user_id", ids);
  if (subError) throw subError;
  // Sem conteúdo privado no payload ou na tela bloqueada do computador.
  for (let offset = 0; offset < (subscriptions?.length ?? 0); offset += 20) {
    await Promise.all(subscriptions!.slice(offset, offset + 20).map(async (sub) => {
      if (!endpointPermitido(sub.endpoint)) return;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, null, {
          TTL: 86400, urgency: "high", timeout: 10000,
          vapidDetails: {
            subject: `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-push`,
            publicKey: config.vapid_public_key, privateKey: config.vapid_private_key,
          },
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("chat_push_assinaturas").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("Falha na entrega push", status ?? "rede");
        }
      }
    }));
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido" }, 405);
  try {
    const body = await request.json();
    if (body.action === "dispatch") {
      const { data: config, error } = await db.from("chat_push_config").select("*").eq("id", true).single();
      if (error) throw error;
      if (typeof body.token !== "string" || body.token !== config.dispatch_token) return reply({ error: "Não autorizado" }, 401);
      if (!Number.isSafeInteger(body.messageId) || body.messageId <= 0) return reply({ error: "Mensagem inválida" }, 400);
      if (config.vapid_public_key && config.vapid_private_key) await despachar(body.messageId, config);
      return reply({ ok: true });
    }
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Entre no sistema" }, 401);
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return reply({ error: "Entre no sistema" }, 401);
    const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", user.id);
    if (roleError) throw roleError;
    if (!roles?.some((r) => ["admin", "operador", "visualizador"].includes(r.role))) return reply({ error: "Sem acesso ao chat" }, 403);
    if (body.action === "key") {
      const config = await configuracao();
      return reply({ publicKey: config.vapid_public_key });
    }
    if (!endpointPermitido(body.subscription?.endpoint ?? body.endpoint)) return reply({ error: "Navegador de notificações não compatível" }, 400);
    if (body.action === "unsubscribe") {
      const { error } = await db.from("chat_push_assinaturas").delete().eq("endpoint", body.endpoint).eq("user_id", user.id);
      if (error) throw error;
      return reply({ ok: true });
    }
    if (body.action !== "subscribe") return reply({ error: "Ação inválida" }, 400);
    const sub = body.subscription;
    if (!/^[A-Za-z0-9_-]{87}$/.test(sub?.keys?.p256dh ?? "") ||
        !/^[A-Za-z0-9_-]{22}$/.test(sub?.keys?.auth ?? "")) {
      return reply({ error: "Assinatura inválida" }, 400);
    }
    const { count, error: countError } = await db.from("chat_push_assinaturas")
      .select("endpoint", { count: "exact", head: true }).eq("user_id", user.id);
    if (countError) throw countError;
    if ((count ?? 0) >= 10) {
      const { data: existing } = await db.from("chat_push_assinaturas").select("endpoint")
        .eq("endpoint", sub.endpoint).eq("user_id", user.id).maybeSingle();
      if (!existing) return reply({ error: "Limite de 10 navegadores atingido" }, 400);
    }
    const { error: saveError } = await db.from("chat_push_assinaturas").upsert({
      user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
    }, { onConflict: "endpoint" });
    if (saveError) throw saveError;
    return reply({ ok: true });
  } catch {
    console.error("Não foi possível processar o aviso do chat");
    return reply({ error: "Serviço de notificações indisponível" }, 503);
  }
});
