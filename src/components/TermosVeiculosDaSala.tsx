import { useEffect, useState } from "react";
import { Car, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { imprimirTermoVeiculo, numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";
import { RecebimentoVeiculosDialog } from "@/components/RecebimentoVeiculosDialog";
import { Button } from "@/components/ui/button";

type Props = {
  salaId: string | null;
  bensDaSala: Tables<"bens">[];
  atualizar: number;
  carregandoBens: boolean;
  erroBens: boolean;
  onAtualizar: () => void;
};

export function TermosVeiculosDaSala({ salaId, bensDaSala, atualizar, carregandoBens, erroBens, onAtualizar }: Props) {
  const [termos, setTermos] = useState<Tables<"recebimentos_veiculos">[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [bemEdicao, setBemEdicao] = useState<Tables<"bens"> | null>(null);

  useEffect(() => { setBemEdicao(null); }, [salaId]);
  useEffect(() => {
    let ativo = true;
    setTermos([]); setErro(false);
    const ids = bensDaSala.filter((bem) => bem.sala_id === salaId).map((bem) => bem.id);
    if (!salaId || carregandoBens || erroBens || !ids.length) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    void (async () => {
      try {
        const registros: Tables<"recebimentos_veiculos">[] = [];
        for (let inicio = 0; inicio < ids.length; inicio += 100) {
          const { data, error } = await supabase.from("recebimentos_veiculos")
            .select("*").in("bem_id", ids.slice(inicio, inicio + 100));
          if (error) throw error;
          registros.push(...(data ?? []));
        }
        registros.sort((a, b) => b.ano - a.ano || Number(b.numero) - Number(a.numero));
        if (ativo) setTermos(registros);
      } catch { if (ativo) setErro(true); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [salaId, bensDaSala, atualizar, carregandoBens, erroBens, tentativa]);

  const aguardando = carregando || carregandoBens;
  const falha = erro || erroBens;
  const bensPorId = new Map(bensDaSala.filter((bem) => bem.sala_id === salaId).map((bem) => [bem.id, bem]));
  return <section aria-label="Termos de recebimento de veículos da sala" className="space-y-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Car className="h-4 w-4 text-primary" />Recebimento de Veículos</h3>
      <p className="text-xs text-muted-foreground">Termos registrados: {aguardando || falha ? "—" : termos.length}</p>
    </div>
    <div className="max-h-[320px] overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted text-foreground">
          <tr className="text-left [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2">
            <th>Termo de recebimento</th><th>Patrimônio / RED</th><th>Placa</th><th>Secretaria de destino</th><th>Data do recebimento</th><th className="text-right">Valor do bem</th><th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {aguardando ? <tr><td colSpan={7} className="p-4 text-center" role="status">Carregando termos de recebimento de veículos...</td></tr>
            : falha ? <tr><td colSpan={7} className="p-4 text-center"><p role="alert">Não foi possível carregar os termos de recebimento de veículos.</p><Button size="sm" variant="outline" onClick={() => { setTentativa((n) => n + 1); if (erroBens) onAtualizar(); }}>Tentar novamente</Button></td></tr>
            : !termos.length ? <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">{salaId ? "Nenhum termo de recebimento de veículos registrado para os bens desta sala." : "Selecione uma sala para consultar os recebimentos de veículos."}</td></tr>
            : termos.map((termo) => {
              const bem = bensPorId.get(termo.bem_id);
              if (!bem) return null;
              const dados = lerDadosRecebimento(termo.dados);
              return <tr key={termo.bem_id} className="border-b last:border-0 [&_td]:px-3 [&_td]:py-2">
                <td className="whitespace-nowrap font-bold">{numeroTermoVeiculo(termo)}</td>
                <td>{formatarCodigoRed(bem.codigo_red)}</td><td className="whitespace-nowrap">{dados.placa || "—"}</td>
                <td>{dados.secretaria || "Não informada"}</td>
                <td className="whitespace-nowrap">{dados.data_recebimento ? dados.data_recebimento.split("-").reverse().join("/") : "Não registrada"}</td>
                <td className="whitespace-nowrap text-right">{Number(bem.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                <td><div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" aria-label={`Editar recebimento de veículos ${numeroTermoVeiculo(termo)}`} onClick={() => setBemEdicao(bem)}><Pencil className="mr-2 h-4 w-4" />Abrir formulário</Button>
                  <Button type="button" size="sm" variant="outline" aria-label={`Imprimir recebimento de veículos ${numeroTermoVeiculo(termo)}`} onClick={() => { if (!imprimirTermoVeiculo(bem, termo, dados.local_fisico || "")) toast.error("Permita a abertura de janelas para imprimir o termo."); }}><Printer className="mr-2 h-4 w-4" />Imprimir termo</Button>
                </div></td>
              </tr>;
            })}
        </tbody>
      </table>
    </div>
    {bemEdicao && <RecebimentoVeiculosDialog bem={bemEdicao} onClose={() => setBemEdicao(null)} onSaved={() => setTentativa((n) => n + 1)} />}
  </section>;
}
