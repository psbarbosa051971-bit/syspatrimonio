import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TermoDaSala } from "@/lib/termos-da-sala";
import { EntregaTermoDialog } from "@/components/EntregaTermoDialog";
import { Button } from "@/components/ui/button";

type Entrega = Tables<"entregas_termos">;
type Props = { termo: TermoDaSala; onAtualizar: (entrega: Entrega | null) => void };

/** Cada montagem deve ser identificada pelo id do termo no componente pai. */
export function DadosEntregaTermo({ termo, onAtualizar }: Props) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro(false);
    async function carregar() {
      const { data, error } = await supabase.from("entregas_termos")
        .select("*").eq("importacao_id", termo.id).maybeSingle();
      if (error) throw error;
      if (ativo) { setEntrega(data); onAtualizar(data); }
    }
    carregar().catch(() => { if (ativo) setErro(true); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [termo.id, tentativa, onAtualizar]);

  if (carregando) return <p role="status" className="text-sm text-muted-foreground">Carregando dados da entrega...</p>;
  if (erro) return <div className="space-y-2 rounded-md border p-3">
    <p role="alert" className="text-sm text-destructive">Não foi possível carregar os dados da entrega deste termo.</p>
    <Button type="button" variant="outline" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>
  </div>;
  return <EntregaTermoDialog termo={termo} entrega={entrega} embutido onFechar={() => {}}
    onSalvar={(registro) => { setEntrega(registro); onAtualizar(registro); }} />;
}
