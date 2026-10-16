import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type NumeroTransferencia = { numero: number; ano: number };

export function useNumeroTransferencia(ativo: boolean) {
  const pedidoId = useRef<string | null>(null);
  const [numero, setNumero] = useState<NumeroTransferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!ativo || numero) {
      setCarregando(false);
      return;
    }
    let atual = true;
    setCarregando(true);
    setErro("");
    async function reservar() {
      try {
        pedidoId.current ??= crypto.randomUUID();
        const { data, error } = await supabase.rpc("reservar_numero_transferencia", {
          _pedido: pedidoId.current,
        });
        if (error) throw error;
        const dados = data as NumeroTransferencia | null;
        if (!dados || !Number.isSafeInteger(dados.numero) || dados.numero < 1 ||
          !Number.isInteger(dados.ano) || dados.ano < 2000) {
          throw new Error("Número de transferência inválido");
        }
        if (atual) setNumero({ numero: dados.numero, ano: dados.ano });
      } catch {
        if (atual) setErro("Não foi possível reservar o número da transferência. Tente novamente antes de salvar.");
      } finally {
        if (atual) setCarregando(false);
      }
    }
    void reservar();
    return () => { atual = false; };
  }, [ativo, numero, tentativa]);

  return { pedidoId, numero, carregando, erro, tentarNovamente: () => setTentativa((n) => n + 1) };
}
