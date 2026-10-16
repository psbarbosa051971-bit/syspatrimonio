import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type NumeroTransferencia = { numero: number; ano: number };

export function useNumeroTransferencia(ativo: boolean) {
  const [numero, setNumero] = useState<NumeroTransferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!ativo) {
      setNumero(null);
      setCarregando(false);
      return;
    }
    let atual = true;
    setCarregando(true);
    setErro("");
    async function consultar() {
      try {
        const { data, error } = await supabase.rpc("consultar_proximo_numero_transferencia");
        if (error) throw error;
        const dados = data as NumeroTransferencia | null;
        if (!dados || !Number.isSafeInteger(dados.numero) || dados.numero < 1 ||
          !Number.isInteger(dados.ano) || dados.ano < 2000) {
          throw new Error("Número de transferência inválido");
        }
        if (atual) setNumero({ numero: dados.numero, ano: dados.ano });
      } catch {
        if (atual) setErro("Não foi possível consultar o próximo número da transferência. Tente novamente.");
      } finally {
        if (atual) setCarregando(false);
      }
    }
    void consultar();
    return () => { atual = false; };
  }, [ativo, tentativa]);

  return { numero, carregando, erro, tentarNovamente: () => setTentativa((n) => n + 1) };
}
