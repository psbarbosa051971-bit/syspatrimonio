import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dadosDaChave, dadosDoXmlNfe } from "@/lib/checklist-veiculos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeitorChaveNfe } from "@/components/LeitorChaveNfe";

type Props = { dados: Record<string, string>; onChange: (valores: Record<string, string>) => void };

export function ChaveAcessoNfe({ dados, onChange }: Props) {
  const [lendo, setLendo] = useState(false);
  const [camera, setCamera] = useState(false);
  const requisicao = useRef<AbortController | null>(null);
  const chaveAtual = useRef(dados.chave_acesso);
  chaveAtual.current = dados.chave_acesso;
  useEffect(() => () => { requisicao.current?.abort(); requisicao.current = null; }, []);

  async function lerChave(texto = dados.chave_acesso ?? "") {
    let extraidos: Record<string, string>;
    try { extraidos = dadosDaChave(texto); }
    catch (erro) { toast.error((erro as Error).message); return; }
    requisicao.current?.abort();
    const controle = new AbortController();
    requisicao.current = controle;
    onChange({ ...extraidos, fornecedor: extraidos.cnpj_fornecedor === dados.cnpj_fornecedor ? dados.fornecedor ?? "" : "" });
    setLendo(true);
    const tempo = setTimeout(() => controle.abort(), 10000);
    try {
      const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${extraidos.cnpj_fornecedor}`, { signal: controle.signal });
      if (!resposta.ok) throw new Error("Consulta indisponível");
      const empresa = await resposta.json();
      if (typeof empresa.razao_social !== "string" || !empresa.razao_social.trim()) throw new Error("Fornecedor não encontrado");
      if (requisicao.current !== controle || chaveAtual.current !== extraidos.chave_acesso) return;
      onChange({ fornecedor: empresa.razao_social.trim() });
      toast.success("Nota fiscal e fornecedor preenchidos. Confira os dados antes de salvar.");
    } catch {
      if (requisicao.current === controle) toast.info("Número da nota preenchido. Não foi possível consultar o fornecedor: informe o nome ou carregue o XML da NF-e.");
    } finally { clearTimeout(tempo); if (requisicao.current === controle) setLendo(false); }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
    <label className="block space-y-1 text-sm font-semibold">
      <span>Chave de acesso da NF-e</span>
      <Input inputMode="numeric" autoComplete="off" maxLength={300} placeholder="Digite, cole ou leia os 44 dígitos com um leitor de código de barras"
        value={dados.chave_acesso ?? ""} onChange={(e) => { requisicao.current?.abort(); requisicao.current = null; setLendo(false); onChange({ chave_acesso: e.target.value }); }} />
    </label>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={lendo || !dados.chave_acesso?.trim()} onClick={() => { void lerChave(); }}>{lendo ? "Consultando fornecedor…" : "Ler chave e preencher"}</Button>
      <Button type="button" variant="outline" onClick={() => setCamera((atual) => !atual)}>{camera ? "Fechar câmera" : "Ler com a câmera"}</Button>
      <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold">
        <span>Ou carregar XML da NF-e</span>
        <Input type="file" accept=".xml,application/xml,text/xml" className="text-xs" onChange={async (e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (!arquivo) return;
          if (arquivo.size > 5 * 1024 * 1024) { toast.error("Selecione um XML de até 5 MB."); return; }
          try {
            const valores = dadosDoXmlNfe(await arquivo.text());
            requisicao.current?.abort(); requisicao.current = null; setLendo(false);
            onChange(valores); toast.success("Nota fiscal, emissão e fornecedor lidos do XML. Confira os dados.");
          } catch (erro) { toast.error((erro as Error).message); }
        }} />
      </label>
    </div>
    {camera && <LeitorChaveNfe onClose={() => setCamera(false)} onRead={(chave) => { setCamera(false); chaveAtual.current = chave; void lerChave(chave); }} />}
    {dados.cnpj_fornecedor && <p className="text-xs text-muted-foreground">CNPJ do emitente: {dados.cnpj_fornecedor}</p>}
    <p className="text-xs text-muted-foreground">A chave informa o número da nota e o CNPJ. O fornecedor é consultado no serviço público BrasilAPI, sujeito à disponibilidade. A data exata de emissão vem do XML ou deve ser informada manualmente; pedido e empenho são de preenchimento manual.</p>
  </section>;
}
