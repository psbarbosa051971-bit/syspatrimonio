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
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const [recebida, setRecebida] = useState<Pick<Mensagem, "id" | "conversa_id"> | null>(null);
  const destino = administrador ? selecionada : userId;

  // Continua verificando novas mensagens mesmo com a janela minimizada.
  useEffect(() => {
    let cancelado = false;
    let consultando = false;
    let ultimoId: number | null = null;
    const verificar = async () => {
      if (consultando) return;
      consultando = true;
      try {
        const { data, error } = await supabase.from("chat_mensagens")
          .select("id, conversa_id").neq("autor_id", userId)
          .order("id", { ascending: false }).limit(1);
        if (error || cancelado) return;
        const ultima = data?.[0];
        if (ultima && ultimoId !== null && ultima.id > ultimoId) setRecebida(ultima);
        ultimoId = ultima?.id ?? ultimoId ?? 0;
      } catch {
        // Falhas transitórias são tentadas novamente no próximo intervalo.
      } finally {
        consultando = false;
      }
    };
    void verificar();
    const intervalo = setInterval(() => void verificar(), 5000);
    return () => { cancelado = true; clearInterval(intervalo); };
  }, [userId]);

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
  }, [aberto, administrador, destino, limite, versao, recebida?.id]);

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

  const excluir = useCallback(async (id: number) => {
    if (!destino || excluindo !== null) return false;
    setExcluindo(id);
    setErro("");
    try {
      const { data, error } = await supabase.from("chat_mensagens").delete()
        .eq("id", id).eq("conversa_id", destino).select("id");
      if (error || !data?.length) throw error ?? new Error("Mensagem não encontrada");
      setMensagens((atuais) => atuais.filter((mensagem) => mensagem.id !== id));
      setVersao((v) => v + 1);
      return true;
    } catch {
      setErro("Não foi possível excluir a mensagem. Tente novamente.");
      return false;
    } finally {
      setExcluindo(null);
    }
  }, [destino, excluindo]);

  return {
    conversas, selecionada, setSelecionada, mensagens, carregando, enviando, erro, enviar, recebida,
    excluir, excluindo,
    temAnteriores: mensagens.length >= limite,
    carregarAnteriores: () => setLimite((valor) => valor + 100),
  };
}
