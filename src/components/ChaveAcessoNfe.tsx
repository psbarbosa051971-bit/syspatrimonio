import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dadosDaChave, dadosDoXmlNfe, extrairChaveNfe } from "@/lib/checklist-veiculos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeitorChaveNfe } from "@/components/LeitorChaveNfe";

type Props = {
  dados: Record<string, string>;
  onChange: (valores: Record<string, string>) => void;
  onPreenchido?: (valores: Record<string, string>, focarEmissao?: boolean) => void;
};

export function ChaveAcessoNfe({ dados, onChange, onPreenchido }: Props) {
  const [lendo, setLendo] = useState(false);
  const [camera, setCamera] = useState(false);
  const requisicao = useRef<AbortController | null>(null);
  const ultimaLeitura = useRef("");
  const chaveAtual = useRef(dados.chave_acesso);
  const fornecedorAtual = useRef(dados.fornecedor);
  chaveAtual.current = dados.chave_acesso;
  fornecedorAtual.current = dados.fornecedor;
  useEffect(() => () => { requisicao.current?.abort(); requisicao.current = null; }, []);

  async function lerChave(texto = dados.chave_acesso ?? "") {
    let extraidos: Record<string, string>;
    try { extraidos = dadosDaChave(texto); }
    catch (erro) { toast.error((erro as Error).message); return; }
    if (ultimaLeitura.current === extraidos.chave_acesso) return;
    ultimaLeitura.current = extraidos.chave_acesso;
    requisicao.current?.abort();
    requisicao.current = null;
    chaveAtual.current = extraidos.chave_acesso;
    // O dia não existe na chave. Preserve-o somente se a data já informada for do mesmo mês.
    extraidos.emissao = dados.emissao?.startsWith(`${extraidos.emissao_mes}-`) ? dados.emissao : "";
    onChange(extraidos);
    onPreenchido?.(extraidos);
    toast.success("Nota fiscal e mês/ano da emissão preenchidos. Complete ou confira o dia da emissão.");
    if (fornecedorAtual.current?.trim()) { setLendo(false); return; }
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
      if (!fornecedorAtual.current?.trim()) {
        const valores = { fornecedor: empresa.razao_social.trim() };
        onChange(valores); onPreenchido?.(valores, false);
      }
    } catch {
      if (requisicao.current === controle) toast.info("Informe o fornecedor manualmente ou carregue o XML da NF-e.");
    } finally { clearTimeout(tempo); if (requisicao.current === controle) { requisicao.current = null; setLendo(false); } }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
    <label className="block space-y-1 text-sm font-semibold">
      <span>Chave de acesso da NF-e</span>
      <Input inputMode="numeric" autoComplete="off" maxLength={300} placeholder="Digite, cole ou leia os 44 dígitos com um leitor de código de barras"
        value={dados.chave_acesso ?? ""} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lerChave(e.currentTarget.value); } }}
        onChange={(e) => {
          const texto = e.target.value;
          requisicao.current?.abort(); requisicao.current = null; setLendo(false);
          onChange({ chave_acesso: texto });
          let chave: string;
          try { chave = extrairChaveNfe(texto); } catch { ultimaLeitura.current = ""; return; }
          if (chave !== ultimaLeitura.current) void lerChave(chave);
        }} />
    </label>
    <p role="status" className="text-xs text-muted-foreground">{lendo ? "Consultando fornecedor…" : "Preenchimento automático ao completar uma chave válida, inclusive pelo leitor ou câmera."}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={lendo || !dados.chave_acesso?.trim()} onClick={() => { ultimaLeitura.current = ""; void lerChave(); }}>Ler chave e preencher</Button>
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
            ultimaLeitura.current = valores.chave_acesso;
            chaveAtual.current = valores.chave_acesso;
            const preenchidos = { ...valores, ...(fornecedorAtual.current?.trim() ? { fornecedor: fornecedorAtual.current ?? "" } : {}) };
            onChange(preenchidos);
            onPreenchido?.(Object.fromEntries(Object.entries(valores).filter(([chave]) => chave !== "fornecedor" || !fornecedorAtual.current?.trim())));
            toast.success(valores.valor ? "Nota fiscal, emissão e valor total lidos do XML. O fornecedor digitado foi mantido."
              : "Nota fiscal e emissão lidas do XML. Este arquivo não informa o valor total; preencha o campo Valor.");
          } catch (erro) { toast.error((erro as Error).message); }
        }} />
      </label>
    </div>
    {camera && <LeitorChaveNfe onClose={() => setCamera(false)} onRead={(chave) => { setCamera(false); void lerChave(chave); }} />}
    {dados.cnpj_fornecedor && <p className="text-xs text-muted-foreground">CNPJ do emitente: {dados.cnpj_fornecedor}</p>}
    <p className="text-xs text-muted-foreground">A chave preenche a Nota fiscal e o mês/ano da emissão; complete o dia no campo Emissão. Os 44 dígitos não contêm o dia nem o valor. O XML preenche a data completa e o valor total. Campos preenchidos pela leitura ficam amarelos com letras azuis. O fornecedor digitado é mantido; se vazio, é consultado na BrasilAPI, sujeito à disponibilidade. Pedido e empenho são manuais.</p>
  </section>;
}
