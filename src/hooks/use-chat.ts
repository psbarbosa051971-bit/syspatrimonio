import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["chat_conversas"]["Row"];
type Mensagem = Database["public"]["Tables"]["chat_mensagens"]["Row"];

export function useChat(userId: string, administrador: boolean, aberto: boolean) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [limite, setLimite] = useState(100);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const destino = administrador ? selecionada : userId;

  useEffect(() => {
    setMensagens([]);
    setLimite(100);
  }, [destino]);

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    let consultando = false;
    setCarregando(true);
    const carregar = async () => {
      if (consultando) return;
      consultando = true;
      try {
        if (administrador) {
          const { data, error } = await supabase.from("chat_conversas")
            .select("*").order("criado_em", { ascending: false });
          if (error) throw error;
          if (!cancelado) setConversas(data ?? []);
        }
        if (destino) {
          const { data, error } = await supabase.from("chat_mensagens").select("*")
            .eq("conversa_id", destino).order("id", { ascending: false }).limit(limite);
          if (error) throw error;
          if (!cancelado) setMensagens((data ?? []).reverse());
        }
        if (!cancelado) setErro("");
      } catch {
        if (!cancelado) setErro("Não foi possível atualizar o chat. Tentaremos novamente em alguns segundos.");
      } finally {
        consultando = false;
        if (!cancelado) setCarregando(false);
      }
    };
    void carregar();
    const intervalo = setInterval(() => void carregar(), 5000);
    return () => { cancelado = true; clearInterval(intervalo); };
  }, [aberto, administrador, destino, limite, versao]);

  const enviar = useCallback(async (texto: string) => {
    const conteudo = texto.trim();
    if (!destino || !conteudo || conteudo.length > 2000 || enviando) return false;
    setEnviando(true);
    setErro("");
    try {
      if (!administrador) {
        const { error } = await supabase.from("chat_conversas").upsert(
          { user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      const { error } = await supabase.from("chat_mensagens").insert({
        conversa_id: destino, autor_id: userId, conteudo,
      });
      if (error) throw error;
      setVersao((v) => v + 1);
      return true;
    } catch {
      setErro("Não foi possível enviar a mensagem. Seu texto foi mantido; tente novamente.");
      return false;
    } finally {
      setEnviando(false);
    }
  }, [administrador, destino, enviando, userId]);

  return {
    conversas, selecionada, setSelecionada, mensagens, carregando, enviando, erro, enviar,
    temAnteriores: mensagens.length >= limite,
    carregarAnteriores: () => setLimite((valor) => valor + 100),
  };
}
