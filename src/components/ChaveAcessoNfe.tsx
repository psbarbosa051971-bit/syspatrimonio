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
  const fornecedorAtual = useRef(dados.fornecedor);
  chaveAtual.current = dados.chave_acesso;
  fornecedorAtual.current = dados.fornecedor;
  useEffect(() => () => { requisicao.current?.abort(); requisicao.current = null; }, []);

  async function lerChave(texto = dados.chave_acesso ?? "") {
    let extraidos: Record<string, string>;
    try { extraidos = dadosDaChave(texto); }
    catch (erro) { toast.error((erro as Error).message); return; }
    requisicao.current?.abort();
    requisicao.current = null;
    chaveAtual.current = extraidos.chave_acesso;
    onChange(extraidos);
    if (fornecedorAtual.current?.trim()) {
      setLendo(false);
      toast.success("Nota fiscal preenchida. O fornecedor digitado foi mantido. Para preencher o valor automaticamente, carregue o XML da NF-e.");
      return;
    }
    const controle = new AbortController();
    requisicao.current = controle;
    setLendo(true);
    const tempo = setTimeout(() => controle.abort(), 10000);
    try {
      const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${extraidos.cnpj_fornecedor}`, { signal: controle.signal });
      if (!resposta.ok) throw new Error("Consulta indisponível");
      const empresa = await resposta.json();
      if (typeof empresa.razao_social !== "string" || !empresa.razao_social.trim()) throw new Error("Fornecedor não encontrado");
      if (requisicao.current !== controle || chaveAtual.current !== extraidos.chave_acesso) return;
      if (!fornecedorAtual.current?.trim()) onChange({ fornecedor: empresa.razao_social.trim() });
      toast.success("Nota fiscal preenchida e fornecedor mantido. Para preencher o valor automaticamente, carregue o XML da NF-e.");
    } catch {
      if (requisicao.current === controle) toast.info("Número da nota preenchido. Informe o fornecedor e o valor ou carregue o XML da NF-e.");
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
            onChange({ ...valores, ...(fornecedorAtual.current?.trim() ? { fornecedor: fornecedorAtual.current } : {}) });
            toast.success(valores.valor
              ? "Nota fiscal, emissão e valor total lidos do XML. O fornecedor digitado foi mantido; se estava vazio, foi preenchido pelo XML."
              : "Nota fiscal e emissão lidas do XML. Este arquivo não informa o valor total; preencha o campo Valor.");
          } catch (erro) { toast.error((erro as Error).message); }
        }} />
      </label>
    </div>
    {camera && <LeitorChaveNfe onClose={() => setCamera(false)} onRead={(chave) => { setCamera(false); chaveAtual.current = chave; void lerChave(chave); }} />}
    {dados.cnpj_fornecedor && <p className="text-xs text-muted-foreground">CNPJ do emitente: {dados.cnpj_fornecedor}</p>}
    <p className="text-xs text-muted-foreground">A leitura da chave preenche a Nota fiscal, mas a chave de 44 dígitos não contém o valor. Carregue o XML para preencher também o valor total da nota e a emissão, ou informe-os manualmente. O fornecedor digitado é mantido e fica gravado ao salvar o formulário; quando vazio, é consultado na BrasilAPI, sujeito à disponibilidade, ou preenchido pelo XML. Pedido e empenho são de preenchimento manual.</p>
  </section>;
}
