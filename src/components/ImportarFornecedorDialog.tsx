import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parsearFornecedorHtml, type ItemFornecedor } from "@/lib/html-fornecedor";
import { extrairFornecedorPdf } from "@/lib/pdf-fornecedor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ImportarFornecedorDialog({ onFornecedorChange }: { onFornecedorChange?: (fornecedor: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemFornecedor[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [sel, setSel] = useState(0);
  const [lendo, setLendo] = useState(false);

  const ler = async (f?: File) => {
    if (!f) return;
    setItens([]); setFaltantes([]); setSel(0);
    if (!/\.(pdf|html?)$/i.test(f.name)) {
      toast.error("Selecione um arquivo HTML ou PDF do Sonner.");
      return;
    }
    setLendo(true);
    try {
      const lidos = /\.pdf$/i.test(f.name)
        ? await extrairFornecedorPdf(f)
        : parsearFornecedorHtml(await f.text());
      if (!lidos.length) toast.error("Nenhum bem encontrado no relatório por fornecedor. Use HTML ou PDF com texto selecionável do Sonner.");
      setItens(lidos);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ler o relatório por fornecedor.");
    } finally {
      setLendo(false);
    }
  };

  const editar = (campo: keyof ItemFornecedor, v: string) =>
    setItens((a) => a.map((it, i) => (i === sel ? { ...it, [campo]: v } : it)));

  const [faltantes, setFaltantes] = useState<ItemFornecedor[]>([]);

  const vincular = async () => {
    setSalvando(true);
    const data: { codigo_red: string; vinculados: number }[] = [];
    for (let i = 0; i < itens.length; i += 200) {
      const r = await supabase.rpc("vincular_dados_fornecedor", { _itens: itens.slice(i, i + 200) });
      if (r.error) { setSalvando(false); toast.error(`Não foi possível vincular os dados: ${r.error.message}`); return; }
      data.push(...(r.data ?? []));
    }
    setSalvando(false);
    const ok = data.filter((r) => r.vinculados > 0).length;
    const semVinculo = new Set(data.filter((r) => r.vinculados === 0).map((r) => r.codigo_red));
    const falta = itens.filter((it) => semVinculo.has(it.codigo_red));
    toast.success(`${ok} bem(ns) vinculado(s).`);
    if (falta.length) setFaltantes(falta);
  };

  const incluirFaltantes = async () => {
    setSalvando(true);
    const r = await supabase.rpc("incluir_bens_fornecedor", { _itens: faltantes });
    setSalvando(false);
    if (r.error) { toast.error(`Não foi possível incluir: ${r.error.message}`); return; }
    toast.success(`${r.data ?? 0} bem(ns) incluído(s) no sistema.`);
    setFaltantes([]);
  };

  const atual = itens[sel];
  useEffect(() => {
    const fornecedor = atual?.fornecedor.trim();
    if (fornecedor) onFornecedorChange?.(fornecedor);
  }, [atual?.fornecedor, onFornecedorChange]);
  const campos: [keyof ItemFornecedor, string][] = [
    ["ano_pedido", "Ano pedido"], ["pedido", "Pedido"], ["ano_empenho", "Ano empenho"],
    ["empenho", "Empenho"], ["nota_fiscal", "Nota fiscal (Doc. Entrada)"], ["fornecedor", "Fornecedor"],
  ];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setItens([]); setAberto(true); }}>
        <Truck className="mr-1 h-4 w-4" /> Importar por fornecedor
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Bens Incorporados - por Fornecedor</DialogTitle></DialogHeader>
          <Input type="file" accept=".html,.htm,text/html,.pdf,application/pdf" aria-label="Arquivo HTML ou PDF por fornecedor" disabled={lendo || salvando}
            onChange={(e) => { const arquivo = e.target.files?.[0]; e.target.value = ""; void ler(arquivo); }} />
          <p className="text-sm text-muted-foreground">{lendo ? "Lendo relatório..." : "Anexe o relatório do Sonner em HTML ou PDF com texto selecionável."}</p>
          {atual && <>
            <div className="grid gap-2 rounded border p-3 sm:grid-cols-3">
              <p className="sm:col-span-3 text-sm font-semibold">Código RED. {atual.codigo_red} — {atual.descricao}</p>
              {campos.map(([c, r]) => (
                <div key={c} className={c === "fornecedor" ? "sm:col-span-2" : ""}>
                  <Label htmlFor={`f-${c}`}>{r}</Label>
                  <Input id={`f-${c}`} value={atual[c]} onChange={(e) => editar(c, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="max-h-64 overflow-auto rounded border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted"><tr>
                  <th className="p-1 text-left">Código</th><th className="p-1 text-left">Descrição</th>
                  <th className="p-1">Ano ped.</th><th className="p-1">Pedido</th><th className="p-1">Ano emp.</th>
                  <th className="p-1">Empenho</th><th className="p-1">NF</th><th className="p-1 text-left">Fornecedor</th>
                </tr></thead>
                <tbody>{itens.map((it, i) => (
                  <tr key={i} onClick={() => setSel(i)} className={`cursor-pointer border-t ${i === sel ? "bg-accent" : ""}`}>
                    <td className="p-1">{it.codigo_red}</td><td className="p-1">{it.descricao}</td>
                    <td className="p-1 text-center">{it.ano_pedido}</td><td className="p-1 text-center">{it.pedido}</td>
                    <td className="p-1 text-center">{it.ano_empenho}</td><td className="p-1 text-center">{it.empenho}</td>
                    <td className="p-1 text-center">{it.nota_fiscal}</td><td className="p-1">{it.fornecedor}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{itens.length} bem(ns) lido(s)</span>
              <Button onClick={vincular} disabled={salvando}>{salvando ? "Vinculando..." : "Vincular aos patrimônios"}</Button>
            </div>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={faltantes.length > 0} onOpenChange={(o) => { if (!o) setFaltantes([]); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Números não encontrados no sistema</DialogTitle></DialogHeader>
          <p className="text-sm">{faltantes.length} número(s) do relatório não existem no sistema. Deseja incluí-los?</p>
          <div className="max-h-60 overflow-auto rounded border p-2 text-xs">
            {faltantes.map((f) => <div key={f.codigo_red}>{f.codigo_red} — {f.descricao}</div>)}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setFaltantes([]); toast.info("Importados apenas os números já existentes."); }}>Não</Button>
            <Button onClick={incluirFaltantes} disabled={salvando}>{salvando ? "Incluindo..." : "Sim"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
