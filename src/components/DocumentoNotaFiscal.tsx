import { moedaNota, type NotaFiscalXml, type PessoaNota } from "@/lib/notas-fiscais";

function Pessoa({ titulo, pessoa }: { titulo: string; pessoa: PessoaNota }) {
  return <section className="rounded-lg border border-border p-3">
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
    <p className="font-semibold">{pessoa.nome || "Não informado"}</p>
    <p className="mt-1 text-sm">CNPJ/CPF: {pessoa.documento || "—"}{pessoa.ie && ` · IE: ${pessoa.ie}`}</p>
    <p className="mt-1 text-sm text-muted-foreground">{pessoa.endereco}</p>
  </section>;
}

export function DocumentoNotaFiscal({ nota }: { nota: NotaFiscalXml }) {
  const data = nota.emissao.slice(0, 10).split("-").reverse().join("/");
  return <article aria-label={`Visualização da nota fiscal ${nota.numero}`} className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Nota fiscal eletrônica</p><h3 className="mt-1 text-2xl font-bold">NF-e nº {nota.numero}</h3><p className="mt-1 text-sm text-muted-foreground">Série {nota.serie} · Emissão: {data || "—"}</p></div>
      <div className="rounded-lg bg-primary/10 px-5 py-3"><p className="text-xs uppercase text-muted-foreground">Valor da nota</p><p className="text-2xl font-bold text-primary">{moedaNota(nota.total)}</p></div>
    </header>
    {nota.homologacao && <p role="alert" className="rounded-md border border-destructive p-3 font-semibold text-destructive">Ambiente de homologação — sem valor fiscal.</p>}
    <p className="text-xs text-muted-foreground">Visualização gerada a partir do XML anexado. Não é uma fotografia da nota nem uma validação da autorização na SEFAZ.</p>
    <div className="grid gap-3 md:grid-cols-2"><Pessoa titulo="Fornecedor / Emitente" pessoa={nota.emitente} /><Pessoa titulo="Destinatário" pessoa={nota.destinatario} /></div>
    <section className="rounded-lg bg-muted/40 p-3 text-sm">
      <p><span className="font-semibold">Natureza da operação:</span> {nota.natureza || "—"}</p>
      <p className="mt-2 break-all"><span className="font-semibold">Chave de acesso:</span> {nota.chave.match(/.{1,4}/g)?.join(" ")}</p>
      <p className="mt-2"><span className="font-semibold">Protocolo informado no XML:</span> {nota.protocolo || "Não informado"}</p>
    </section>
    <section><h4 className="mb-2 font-semibold">Produtos da nota ({nota.itens.length})</h4>
      <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[750px] text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase"><tr><th className="p-3">Código / NCM</th><th className="p-3">Descrição</th><th className="p-3">CFOP</th><th className="p-3">Un.</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-right">V. unitário</th><th className="p-3 text-right">Total</th></tr></thead>
        <tbody>{nota.itens.map((item, i) => <tr key={i} className="border-t border-border align-top"><td className="p-3"><p>{item.codigo}</p><p className="text-xs text-muted-foreground">{item.ncm}</p></td><td className="min-w-64 whitespace-pre-wrap break-words p-3">{item.descricao}</td><td className="p-3">{item.cfop}</td><td className="p-3">{item.unidade}</td><td className="p-3 text-right">{Number(item.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td><td className="whitespace-nowrap p-3 text-right">{moedaNota(item.unitario)}</td><td className="whitespace-nowrap p-3 text-right font-medium">{moedaNota(item.total)}</td></tr>)}</tbody>
      </table></div>
    </section>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{[
      ["Produtos", nota.produtos], ["Frete", nota.frete], ["Desconto", nota.desconto], ["ICMS", nota.icms], ["IPI", nota.ipi], ["Total da NF-e", nota.total],
    ].map(([nome, valor]) => <div key={nome} className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">{nome}</dt><dd className="mt-1 font-semibold">{moedaNota(valor)}</dd></div>)}</dl>
    {nota.adicionais && <section className="rounded-lg border border-border p-3"><h4 className="mb-2 text-sm font-semibold">Informações adicionais</h4><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{nota.adicionais}</p></section>}
  </article>;
}
