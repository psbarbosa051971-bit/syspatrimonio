import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { numeroDoTermo } from "@/lib/termo-responsabilidade";
import { resumoTermoDaSala, type TermoDaSala } from "@/lib/termos-da-sala";
import { Button } from "@/components/ui/button";
import { IncluirBensTermoDialog } from "@/components/IncluirBensTermoDialog";
import { TermosResponsabilidadeDialog } from "@/components/TermosResponsabilidadeDialog";
import { Printer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  salaId: string | null; atualizar: number; selecionado: string | null;
  quantidadeBens: number; valorSala: number;
  onSelecionar: (termo: TermoDaSala) => void; onLimpar: () => void;
  onAtualizar: () => void;
};
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function TermosDaSala({ salaId, atualizar, selecionado, quantidadeBens, valorSala, onSelecionar, onLimpar, onAtualizar }: Props) {
  const [termos, setTermos] = useState<TermoDaSala[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [termoImpressao, setTermoImpressao] = useState("");
  useEffect(() => {
    let ativo = true;
    setTermos([]); setErro(false); setTermoImpressao("");
    if (!salaId) { setCarregando(false); return; }
    setCarregando(true);
    async function carregar() {
      const todos: TermoDaSala[] = [];
      for (let inicio = 0; ; inicio += 100) {
        const { data, error } = await supabase.from("importacoes")
          .select("id,numero,termo_ano,created_at,arquivo,termo_snapshot")
          .eq("sala_id", salaId!).not("termo_snapshot", "is", null)
          .order("numero", { ascending: false }).range(inicio, inicio + 99);
        if (error) throw error;
        todos.push(...(data ?? []));
        if (!data || data.length < 100) break;
      }
      if (ativo) setTermos(todos);
    }
    carregar().catch(() => { if (ativo) setErro(true); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [salaId, atualizar, tentativa]);
  return <Card className="min-w-0 lg:col-span-2">
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Termos criados da sala</CardTitle>
        {selecionado && <div className="flex flex-wrap gap-2">
          {salaId && termos.filter((termo) => termo.id === selecionado).map((termo) =>
            <IncluirBensTermoDialog key={`${salaId}:${termo.id}`} salaId={salaId} termo={termo} onAtualizar={onAtualizar} />)}
          <Button size="sm" variant="outline" onClick={onLimpar}>Mostrar todos os bens da sala</Button>
        </div>}
      </div>
      <CardDescription>Clique no número do termo para mostrar seus bens atuais em Bens da sala e liberar Incluir bens ao termo. Quantidade e valor correspondem ao documento salvo, incluindo os bens anexados; bens transferidos, excluídos ou vinculados a outro termo não aparecem no filtro atual.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="max-h-64 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-foreground">
            <tr className="text-left [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2">
              <th>Termo</th><th>Bens</th><th>Status</th><th>Recebido por</th><th>Recebimento</th><th className="text-right">Valor do termo</th><th>Ano</th><th>Tipo de bem</th><th className="text-right">Impressão</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? <tr><td colSpan={9} className="p-4 text-center" role="status">Carregando termos da sala...</td></tr>
              : erro ? <tr><td colSpan={9} className="p-4 text-center"><p role="alert">Não foi possível carregar os termos.</p><Button size="sm" variant="outline" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button></td></tr>
              : termos.length === 0 ? <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">{salaId ? "Nenhum termo numerado com documento salvo nesta sala." : "Selecione uma sala para consultar os termos."}</td></tr>
              : termos.map((termo) => {
                const resumo = resumoTermoDaSala(termo);
                return <tr key={termo.id} aria-selected={selecionado === termo.id} className={`border-b last:border-0 [&_td]:px-3 [&_td]:py-1.5 ${selecionado === termo.id ? "bg-accent" : "hover:bg-muted/50"}`}>
                  <td><button type="button" className="font-bold text-primary underline" aria-label={`Mostrar bens do termo ${numeroDoTermo(termo)}`} onClick={() => onSelecionar(termo)}>{String(termo.numero).padStart(5, "0")}</button></td>
                  <td>{resumo.dados ? String(resumo.quantidade).padStart(3, "0") : "—"}</td>
                  <td>{resumo.dados ? "GERADO" : "DADOS INDISPONÍVEIS"}</td>
                  <td>{resumo.dados?.responsavel_recebimento || "Não informado"}</td>
                  <td>Não registrado</td>
                  <td className="whitespace-nowrap text-right">{resumo.dados ? moeda(resumo.total) : "—"}</td>
                  <td>{numeroDoTermo(termo).split("/")[1]}</td><td>{resumo.tipos}</td>
                  <td className="text-right"><Button type="button" size="sm" variant="outline" disabled={!resumo.dados} aria-label={`Imprimir termo ${numeroDoTermo(termo)}`} onClick={() => setTermoImpressao(termo.id)}><Printer className="mr-2 h-4 w-4" />Imprimir termo</Button></td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">“Gerado” indica a criação do documento, não a entrega. Recebedor aparece apenas quando registrado no termo; a data de recebimento não é registrada nesses documentos.</p>
      <div className="grid gap-3 rounded-md border-2 border-primary/30 bg-accent p-3 text-center sm:grid-cols-3">
        <div><p className="text-xs font-bold uppercase">Quantidade de termos</p><p className="mt-1 rounded border border-border bg-background p-1 font-semibold">{carregando || erro ? "—" : termos.length}</p></div>
        <div><p className="text-xs font-bold uppercase">Quantidade de bens na sala</p><p className="mt-1 rounded border border-border bg-background p-1 font-semibold">{quantidadeBens}</p></div>
        <div><p className="text-xs font-bold uppercase">Valor total na sala</p><p className="mt-1 rounded border border-border bg-background p-1 font-semibold">{moeda(valorSala)}</p></div>
      </div>
    </CardContent>
    {termoImpressao && salaId && <TermosResponsabilidadeDialog
      key={`${salaId}:${termoImpressao}`} open onOpenChange={(aberto) => { if (!aberto) setTermoImpressao(""); }}
      salaId={salaId} ultimaImportacao={termoImpressao} />}
  </Card>;
}
