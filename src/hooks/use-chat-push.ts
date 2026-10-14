import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type EstadoPush = "verificando" | "indisponivel" | "bloqueado" | "desativado" | "ativado";

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("chat-push", { body });
  if (error || data?.error) throw new Error(data?.error ?? "Serviço indisponível");
  return data;
}

function chavePublica(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function useChatPush(userId: string) {
  const [estado, setEstado] = useState<EstadoPush>("verificando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    if (!window.isSecureContext || !("Notification" in window) ||
        !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("indisponivel");
      return;
    }
    const verificar = async () => {
      if (Notification.permission === "denied") {
        if (!cancelado) setEstado("bloqueado");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        // Reassocia este navegador à conta atual, sem depender do login anterior.
        if (subscription && Notification.permission === "granted") {
          await chamar({ action: "subscribe", subscription: subscription.toJSON() });
          if (!cancelado) setEstado("ativado");
        } else if (!cancelado) setEstado("desativado");
      } catch {
        if (!cancelado) {
          setEstado("desativado");
          setErro("Não foi possível confirmar os avisos. Tente ativá-los novamente.");
        }
      }
    };
    void verificar();
    return () => { cancelado = true; };
  }, [userId]);

  async function ativar() {
    if (ocupado) return;
    setOcupado(true); setErro("");
    try {
      // A permissão precisa ser pedida diretamente após o clique do usuário.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setEstado(permission === "denied" ? "bloqueado" : "desativado");
        return;
      }
      const { publicKey } = await chamar({ action: "key" });
      if (typeof publicKey !== "string") throw new Error("Chave indisponível");
      const registration = await navigator.serviceWorker.register("/chat-push-sw.js", { scope: "/" });
      const ready = await navigator.serviceWorker.ready;
      let subscription = await ready.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: chavePublica(publicKey),
      });
      await chamar({ action: "subscribe", subscription: subscription.toJSON() });
      setEstado("ativado");
    } catch {
      setErro("Não foi possível ativar. Abra o site publicado em uma aba própria e tente novamente. Se persistir, o serviço de notificações precisa ser publicado no Lovable.");
    } finally { setOcupado(false); }
  }

  async function desativar() {
    if (ocupado) return;
    setOcupado(true); setErro("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await chamar({ action: "unsubscribe", endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setEstado("desativado");
    } catch {
      setErro("Não foi possível desativar. Tente novamente ou bloqueie as notificações nas permissões deste site no navegador.");
    } finally { setOcupado(false); }
  }

  return { estado, ocupado, erro, ativar, desativar };
}
