import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { numeroDoTermo } from "@/lib/termo-responsabilidade";
import type { TermoDaSala } from "@/lib/termos-da-sala";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Bem = Pick<Tables<"bens">, "id" | "codigo_red" | "descricao" | "valor" | "importacao_id">;
type Props = { salaId: string; termo: TermoDaSala; onAtualizar: () => void };
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function IncluirBensTermoDialog({ salaId, termo, onAtualizar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [bens, setBens] = useState<Bem[]>([]);
  const [origens, setOrigens] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [tentativa, setTentativa] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setBusca(""); setSelecionados([]); setBens([]); setOrigens({});
    setConfirmando(false); setErro(""); setCarregando(true);
    async function carregar() {
      const itens: Bem[] = [];
      const numeros: Record<string, string> = {};
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("bens")
          .select("id,codigo_red,descricao,valor,importacao_id")
          .eq("sala_id", salaId).order("id").range(inicio, inicio + 499);
        if (error) throw error;
        itens.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      for (let inicio = 0; ; inicio += 100) {
        const { data, error } = await supabase.from("importacoes")
          .select("id,numero,termo_ano,created_at").eq("sala_id", salaId)
          .order("id").range(inicio, inicio + 99);
        if (error) throw error;
        for (const item of data ?? []) numeros[item.id] = numeroDoTermo(item);
        if (!data || data.length < 100) break;
      }
      if (ativo) {
        setBens(itens.sort((a, b) => a.codigo_red.localeCompare(b.codigo_red, "pt-BR", { numeric: true })));
        setOrigens(numeros);
      }
    }
    carregar().catch(() => { if (ativo) setErro("Não foi possível carregar os bens da sala."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [aberto, salaId, termo.id, tentativa]);
  const encontrados = useMemo(() => {
    const texto = normalizar(busca.trim());
    const codigos = texto.split(/[,;\s]+/).filter(Boolean).map((codigo) => codigo.replace(/\./g, ""));
    return bens.filter((bem) => !texto ||
      (codigos.every((codigo) => /^\d+$/.test(codigo))
        ? codigos.some((codigo) => bem.codigo_red.replace(/\./g, "").replace(/^0+(?=\d)/, "").includes(codigo.replace(/^0+(?=\d)/, "")))
        : normalizar(`${bem.codigo_red} ${bem.descricao}`).includes(texto)));
  }, [bens, busca]);
  const escolhidos = bens.filter((bem) => selecionados.includes(bem.id));
  const deOutroTermo = escolhidos.filter((bem) => !!bem.importacao_id && bem.importacao_id !== termo.id).length;
  function alternar(id: string) {
    setConfirmando(false);
    setSelecionados((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id)
      : atuais.length < 500 ? [...atuais, id] : atuais);
  }
  async function incluir() {
    if (salvandoRef.current || !selecionados.length) return;
    salvandoRef.current = true; setSalvando(true); setErro("");
    try {
      const { error } = await supabase.rpc("incluir_bens_no_termo", {
        _termo: termo.id, _sala: salaId, _itens: selecionados,
      });
      if (error) throw error;
      toast.success(`${selecionados.length} bem(ns) incluído(s) no termo ${numeroDoTermo(termo)}.`);
      setAberto(false); onAtualizar();
    } catch (error) {
      setErro(error && typeof error === "object" && "message" in error
        ? String(error.message) : "Não foi possível incluir os bens. Tente novamente.");
      setConfirmando(false);
    } finally { salvandoRef.current = false; setSalvando(false); }
  }
  return <>
    <Button size="sm" onClick={() => setAberto(true)}>Incluir bens ao termo</Button>
    <Dialog open={aberto} onOpenChange={(valor) => { if (!salvandoRef.current) setAberto(valor); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Incluir bens ao termo {numeroDoTermo(termo)}</DialogTitle>
          <DialogDescription>Busque bens da mesma sala, com ou sem termo. A inclusão atualiza o documento deste termo e o vínculo atual do bem, sem mudar sua sala. O documento histórico do termo anterior será preservado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="busca-bens-termo">Buscar código RED ou descrição</Label>
          <Input id="busca-bens-termo" placeholder="Digite um número, vários separados por vírgula ou uma descrição" value={busca} disabled={salvando} onChange={(e) => { setBusca(e.target.value); setConfirmando(false); }} />
          <p className="text-xs text-muted-foreground">Somente bens desta sala. A seleção é mantida ao mudar a busca. Limite de 500 bens por inclusão.</p>
        </div>
        {erro && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{erro}</p>{!bens.length && !carregando && <Button variant="outline" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>}</div>}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left"><tr className="[&_th]:px-3 [&_th]:py-2"><th>Selecionar</th><th>Código RED / descrição</th><th>Termo atual</th><th className="text-right">Valor</th></tr></thead>
            <tbody>
              {carregando ? <tr><td colSpan={4} className="p-4 text-center" role="status">Carregando bens da sala...</td></tr>
                : !encontrados.length ? <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">{erro ? "Lista indisponível." : "Nenhum bem encontrado nesta sala para esta busca."}</td></tr>
                : encontrados.slice(0, 200).map((bem) => {
                  const vinculado = bem.importacao_id === termo.id;
                  return <tr key={bem.id} className="border-b last:border-0 [&_td]:p-3">
                    <td><input type="checkbox" aria-label={`Incluir bem ${bem.codigo_red}`} checked={selecionados.includes(bem.id)} disabled={vinculado || salvando || (selecionados.length >= 500 && !selecionados.includes(bem.id))} onChange={() => alternar(bem.id)} /></td>
                    <td><span className="font-semibold">{bem.codigo_red}</span><p className="max-w-sm break-words text-xs text-muted-foreground">{bem.descricao}</p></td>
                    <td className="text-xs">{vinculado ? "Já neste termo" : bem.importacao_id ? origens[bem.importacao_id] ?? "Outro termo" : "Sem termo"}</td>
                    <td className="whitespace-nowrap text-right">{moeda(Number(bem.valor))}</td>
                  </tr>;
                })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">{encontrados.length} resultado(s). {encontrados.length > 200 ? "Exibindo os primeiros 200; refine a busca para localizar outros bens. " : ""}{selecionados.length} selecionado(s) — {moeda(escolhidos.reduce((total, bem) => total + Number(bem.valor), 0))}</p>
        {confirmando && <div role="alert" className="rounded-md border border-border bg-accent p-3 text-sm">Confirma incluir {selecionados.length} bem(ns) no termo {numeroDoTermo(termo)}? {deOutroTermo > 0 && `${deOutroTermo} bem(ns) deixarão de aparecer como vínculo atual de outro termo. O documento histórico anterior não será alterado.`}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</Button>
          {selecionados.length > 0 && <Button variant="outline" disabled={salvando} onClick={() => { setSelecionados([]); setConfirmando(false); }}>Limpar seleção</Button>}
          <Button disabled={carregando || salvando || !selecionados.length} onClick={() => confirmando ? void incluir() : setConfirmando(true)}>{salvando ? "Incluindo..." : confirmando ? "Confirmar inclusão" : "Incluir bens selecionados"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
