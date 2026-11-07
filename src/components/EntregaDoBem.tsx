import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { bensAtuaisDoTermo, type TermoDaSala } from "@/lib/termos-da-sala";
import { numeroDoTermo } from "@/lib/termo-responsabilidade";
import { DadosEntregaTermo } from "@/components/DadosEntregaTermo";
import { NovoTermoDialog } from "@/components/NovoTermoDialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Usa a mesma entrega do termo, sem criar um segundo registro para o bem. */
export function EntregaDoBem({ bem }: { bem: Tables<"bens"> }) {
  const seletorId = useId();
  const [termos, setTermos] = useState<TermoDaSala[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [abrindoTermo, setAbrindoTermo] = useState(false);
  const [salaNovoTermo, setSalaNovoTermo] = useState<Tables<"salas"> | null>(null);
  const onAtualizar = useCallback(() => {}, []);

  async function abrirNovoTermo() {
    if (!bem.sala_id || abrindoTermo || salaNovoTermo) return;
    setAbrindoTermo(true);
    try {
      const { data, error } = await supabase.from("salas").select("*").eq("id", bem.sala_id).single();
      if (error || !data) throw error ?? new Error("Sala não encontrada");
      setSalaNovoTermo(data);
    } catch {
      toast.error("Não foi possível carregar a sala para criar o termo. Tente novamente.");
    } finally {
      setAbrindoTermo(false);
    }
  }

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro(false); setTermos([]); setSelecionado("");
    async function carregar() {
      if (!bem.sala_id) return;
      const todos: TermoDaSala[] = [];
      for (let inicio = 0; ; inicio += 100) {
        const { data, error } = await supabase.from("importacoes")
          .select("id, numero, termo_ano, created_at, arquivo, termo_snapshot")
          .eq("sala_id", bem.sala_id).not("termo_snapshot", "is", null)
          .order("numero", { ascending: false }).range(inicio, inicio + 99);
        if (error) throw error;
        if (!ativo) return;
        todos.push(...(data ?? []));
        if (!data || data.length < 100) break;
      }
      const vinculados = todos.filter((termo) => bensAtuaisDoTermo([bem], termo).length > 0);
      if (ativo) {
        setTermos(vinculados);
        setSelecionado(vinculados.find((termo) => termo.id === bem.importacao_id)?.id ?? vinculados[0]?.id ?? "");
      }
    }
    carregar().catch(() => { if (ativo) setErro(true); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [bem.id, bem.sala_id, bem.importacao_id, tentativa]);

  const termo = termos.find((item) => item.id === selecionado);
  return <section className="space-y-3 border-t pt-4" aria-label="Entrega vinculada ao bem">
    <div className="space-y-1">
      <h3 className="font-semibold">Dados da entrega</h3>
      <p className="text-sm text-muted-foreground">Entregue por, CPF, Data Entrega e Status são os dados do termo que contém este bem. Salve-os em Salvar entrega; a alteração vale para todo o termo.</p>
    </div>
    {carregando ? <p role="status" className="text-sm text-muted-foreground">Carregando o termo do bem...</p>
      : erro ? <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">Não foi possível consultar o termo deste bem.</p>
        <Button type="button" variant="outline" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</Button>
      </div>
      : !termo ? <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Este bem não possui termo de responsabilidade vinculado nesta sala.</p>
        {bem.sala_id ? <>
          <p className="text-sm text-muted-foreground">Crie um termo numerado para este bem, sem transferi-lo ou duplicar seu cadastro. O número será confirmado ao criar o termo.</p>
          <Button type="button" variant="outline" disabled={abrindoTermo} onClick={abrirNovoTermo}>
            {abrindoTermo ? "Carregando sala..." : "Criar número de termo"}
          </Button>
        </> : <p className="text-sm text-muted-foreground">Vincule este bem a uma sala antes de criar o termo.</p>}
      </div>
      : <>
        {termos.length > 1 && <div className="space-y-1">
          <label htmlFor={seletorId} className="text-sm font-semibold">Termo da entrega</label>
          <select id={seletorId} value={selecionado} onChange={(evento) => setSelecionado(evento.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
            {termos.map((item) => <option key={item.id} value={item.id}>Termo {numeroDoTermo(item)}</option>)}
          </select>
        </div>}
        <p className="text-sm font-semibold">Termo de responsabilidade {numeroDoTermo(termo)}</p>
        <DadosEntregaTermo key={termo.id} termo={termo} onAtualizar={onAtualizar} />
      </>}
    {salaNovoTermo && <NovoTermoDialog sala={salaNovoTermo} bens={[bem]}
      onSaved={() => setTentativa((valor) => valor + 1)}
      onClose={() => setSalaNovoTermo(null)} />}
  </section>;
}
