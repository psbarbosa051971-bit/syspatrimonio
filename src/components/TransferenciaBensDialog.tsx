import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useNumeroTransferencia } from "@/hooks/use-numero-transferencia";
import { supabase } from "@/integrations/supabase/client";
import { responsavelDoLocal } from "@/lib/usuarios.functions";
import { formatarCpf } from "@/lib/cpf";
import type { TermoResponsabilidade } from "@/lib/termo-responsabilidade";
import { ImprimirImportacaoDialog } from "@/components/ImprimirImportacaoDialog";
import { aceitarBens, buscarBensTransferencia, carregarSalasTransferencia, codigosDaBusca, lerTermoTransferencia, type BemTransferencia, type SalaTransferencia } from "@/lib/transferencias";
import { SeletorLocalFisico } from "@/components/SeletorLocalFisico";
import { TabelaBensTransferencia } from "@/components/TabelaBensTransferencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { GrupoSolicitacoes } from "@/lib/solicitacoes-bens";

function bensDoAlerta(grupo?: GrupoSolicitacoes): BemTransferencia[] {
  return (grupo?.itens ?? []).filter((item) => item.bem_id && item.sala_id).map((item) => ({
    id: item.bem_id!, sala_id: item.sala_id, codigo_red: item.codigo_red,
    descricao: item.descricao, valor: item.valor, user_id: item.user_id,
    created_at: item.created_at, observacao: item.observacao, conferido: false,
    conferencia_finalizada: false, incorporacao: null, tipo: null, importacao_id: null,
  }));
}

type Props = { onClose: () => void; onSaved: (salaId: string, termoId: string, bemIds?: string[]) => void; grupo?: GrupoSolicitacoes; codigosIniciais?: string };

export function TransferenciaBensDialog({ onClose, onSaved, grupo, codigosIniciais = "" }: Props) {
  const consultarResponsavel = useServerFn(responsavelDoLocal);
  const [salas, setSalas] = useState<SalaTransferencia[]>([]);
  const [carregandoSalas, setCarregandoSalas] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [erroSalas, setErroSalas] = useState("");
  const [destino, setDestino] = useState("");
  const [perfil, setPerfil] = useState<{ nome: string | null; cpf: string | null; matricula: string | null } | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [erroPerfil, setErroPerfil] = useState("");
  const [busca, setBusca] = useState(codigosIniciais);
  const [encontrados, setEncontrados] = useState<BemTransferencia[]>([]);
  const [marcadosBusca, setMarcadosBusca] = useState<string[]>([]);
  const [aceitos, setAceitos] = useState<BemTransferencia[]>(() => bensDoAlerta(grupo));
  const [marcadosSalvar, setMarcadosSalvar] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [filtrando, setFiltrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [termo, setTermo] = useState<TermoResponsabilidade | null>(null);
  const temCodigos = !grupo && Boolean(busca.trim() || aceitos.length);
  const numeracao = useNumeroTransferencia(temCodigos);
  const operacao = useRef(false);
  const destinoInicialAplicado = useRef(false);
  const pedido = useRef<{ id: string; destino: string; itens: { id: string; sala_id: string | null }[] } | null>(null);
  const sala = salas.find((s) => s.id === destino);
  const bloqueado = salvando || filtrando || pendente;

  useEffect(() => {
    let ativo = true;
    setCarregandoSalas(true); setErroSalas("");
    carregarSalasTransferencia().then((dados) => { if (ativo) setSalas(dados); })
      .catch(() => { if (ativo) setErroSalas("Não foi possível carregar as salas de destino."); })
      .finally(() => { if (ativo) setCarregandoSalas(false); });
    return () => { ativo = false; };
  }, [tentativa]);

  useEffect(() => {
    if (!grupo || carregandoSalas || erroSalas || destinoInicialAplicado.current) return;
    destinoInicialAplicado.current = true;
    const informados = grupo.itens.filter((item) => item.tipo === "transferencia");
    const normalizar = (nome: string) => nome.trim().toLocaleLowerCase("pt-BR");
    if (!informados.length || informados.some((item) => !item.destino?.trim())) return;
    const nomes = new Set(informados.map((item) => normalizar(item.destino!)));
    if (nomes.size !== 1) return;
    const candidatas = salas.filter((local) => nomes.has(normalizar(local.nome)) &&
      !grupo.itens.some((item) => item.sala_id === local.id));
    if (candidatas.length === 1) setDestino(candidatas[0]!.id);
  }, [grupo, salas, carregandoSalas, erroSalas]);

  useEffect(() => {
    setPerfil(null); setErroPerfil("");
    if (!destino) { setCarregandoPerfil(false); return; }
    let ativo = true;
    setCarregandoPerfil(true);
    consultarResponsavel({ data: { salaId: destino } }).then((dados) => { if (ativo) setPerfil(dados); })
      .catch(() => { if (ativo) setErroPerfil("Não foi possível consultar o responsável. Tente novamente."); })
      .finally(() => { if (ativo) setCarregandoPerfil(false); });
    return () => { ativo = false; };
  }, [destino, consultarResponsavel, tentativa]);

  function escolherDestino(ids: string[]) {
    if (bloqueado) return;
    setDestino(ids[0] ?? ""); setEncontrados([]); setMarcadosBusca([]);
    setAceitos(bensDoAlerta(grupo)); setMarcadosSalvar([]); setAviso(""); setErro(""); setPerfil(null);
  }

  async function filtrar(e: React.FormEvent) {
    e.preventDefault();
    if (operacao.current || !destino || pendente) return;
    setErro(""); setAviso(""); setEncontrados([]); setMarcadosBusca([]);
    try {
      const codigos = codigosDaBusca(busca);
      operacao.current = true; setFiltrando(true);
      const dados = await buscarBensTransferencia(codigos);
      const faltantes = codigos.filter((c) => !dados.some((b) => b.codigo_red === c));
      const noDestino = dados.filter((b) => b.sala_id === destino);
      const disponiveis = dados.filter((b) => b.sala_id !== destino && !aceitos.some((a) => a.id === b.id));
      setEncontrados(disponiveis);
      setAviso([
        faltantes.length ? `Códigos não encontrados: ${faltantes.join(", ")}.` : "",
        noDestino.length ? `Já estão no destino: ${[...new Set(noDestino.map((b) => b.codigo_red))].join(", ")}.` : "",
        `${disponiveis.length} bem(ns) disponível(is). Bens já aceitos não são repetidos.`,
      ].filter(Boolean).join(" "));
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível filtrar os bens. Tente novamente."); }
    finally { operacao.current = false; setFiltrando(false); }
  }

  function aceitar() {
    const proximos = aceitarBens(aceitos, encontrados, marcadosBusca, destino);
    if (proximos.length > 500) { setErro("Aceite no máximo 500 bens por transferência."); return; }
    setAceitos(proximos); setMarcadosSalvar([]);
    setEncontrados((atuais) => atuais.filter((b) => !marcadosBusca.includes(b.id)));
    setMarcadosBusca([]); setErro("");
    setAviso("Bens aceitos na lista abaixo. Marque os que deseja transferir e clique em Salvar transferência. Nenhum bem foi movido ainda.");
  }

  async function salvar() {
    if (operacao.current || termo) return;
    if (!pedido.current) {
      const itens = aceitos.filter((b) => marcadosSalvar.includes(b.id));
      if (!destino || !itens.length || carregandoPerfil || erroPerfil) return;
      if (itens.length > 500) { setErro("Selecione no máximo 500 bens por transferência. Os demais continuarão pendentes no alerta."); return; }
      pedido.current = { id: crypto.randomUUID(), destino, itens: itens.map((b) => ({ id: b.id, sala_id: b.sala_id })) };
    }
    const atual = pedido.current;
    operacao.current = true; setSalvando(true); setErro("");
    try {
      const { data, error } = await supabase.rpc("transferir_bens", {
        _destino: atual.destino, _itens: atual.itens, _pedido: atual.id,
      });
      if (error) {
        // Erros de validação do banco não efetivam nenhuma parte da transferência.
        if (error.code === "P0001" || error.code?.startsWith("23")) {
          setPendente(false); pedido.current = null;
          setErro(error.message); return;
        }
        throw error;
      }
      const gerado = lerTermoTransferencia(data);
      setTermo(gerado); setPendente(false);
      if (grupo) onSaved(atual.destino, gerado.id, atual.itens.map((item) => item.id));
      else onSaved(atual.destino, gerado.id);
      window.dispatchEvent(new Event("bens-transferidos"));
      toast.success("Transferência realizada com sucesso.");
    } catch {
      setPendente(true);
      setErro("Não foi possível confirmar o resultado. Clique em Verificar transferência para consultar o mesmo pedido com segurança, sem repetir a movimentação.");
    } finally { operacao.current = false; setSalvando(false); }
  }

  if (termo) return <ImprimirImportacaoDialog importacaoId={termo.id} salaId={pedido.current?.destino ?? destino} origem="transferencia" onClose={onClose} />;

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando && !filtrando && !pendente) onClose(); }}>
    <DialogContent onInteractOutside={(e) => e.preventDefault()} className="flex max-h-[94vh] w-[96vw] max-w-6xl flex-col overflow-y-auto [&_input:not([type=checkbox])]:text-base [&_label]:text-base">
      <DialogHeader>
        <DialogTitle>{grupo ? `Transferir bens — ${grupo.local}` : numeracao.numero ? `TERMO DE TRANSFERENCIA Nº ${String(numeracao.numero.numero).padStart(3, "0")}/${numeracao.numero.ano}` : "Gerar transferência"}</DialogTitle>
        <DialogDescription>{grupo ? "Escolha o local de destino no cabeçalho, marque alguns ou todos os bens e clique em Salvar transferência. Os bens não selecionados permanecem pendentes no alerta." : "Escolha o destino, filtre os códigos RED e aceite os bens. A movimentação só será realizada após a segunda seleção e o salvamento."}</DialogDescription>
      </DialogHeader>
      {!grupo && numeracao.carregando && <p role="status" className="text-sm text-muted-foreground">Consultando próximo número do termo...</p>}
      {!grupo && numeracao.numero && <p className="text-sm text-muted-foreground">Número previsto, confirmado somente ao clicar em Salvar transferência. Se cancelar ou fechar sem salvar, esse número continuará disponível para a próxima transferência. Se outro usuário salvar antes, o número será atualizado no salvamento.</p>}
      {!grupo && numeracao.erro && <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-destructive">{numeracao.erro}</p><Button variant="outline" disabled={bloqueado} onClick={numeracao.tentarNovamente}>Consultar número novamente</Button></div>}
      <>
        <section className="space-y-3 rounded-md border-2 border-primary/30 bg-accent p-4" aria-label="Destino da transferência">
          <div className="space-y-1.5"><Label htmlFor="transferencia-destino">Local / sala de destino</Label>
            {carregandoSalas ? <p role="status">Carregando salas...</p> : erroSalas ? <div role="alert"><p className="text-destructive">{erroSalas}</p><Button variant="outline" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button></div> : <SeletorLocalFisico
              id="transferencia-destino" salas={grupo ? salas.filter((s) => !grupo.itens.some((item) => item.sala_id === s.id)) : salas} valor={destino ? [destino] : []} onChange={escolherDestino} disabled={bloqueado} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
            <div className="space-y-1.5"><Label htmlFor="transferencia-matricula">Matrícula</Label>
              <Input id="transferencia-matricula" readOnly value={perfil?.matricula ?? ""} placeholder={carregandoPerfil ? "Consultando..." : "Matrícula não cadastrada"} /></div>
            <div className="space-y-1.5"><Label htmlFor="transferencia-responsavel">Nome do responsável</Label>
              <Input id="transferencia-responsavel" readOnly value={perfil?.nome ?? sala?.responsavel ?? ""} placeholder={carregandoPerfil ? "Consultando responsável..." : "Responsável não cadastrado"} /></div>
            <div className="space-y-1.5"><Label htmlFor="transferencia-cpf">CPF</Label>
              <Input id="transferencia-cpf" readOnly value={perfil?.cpf ? formatarCpf(perfil.cpf) : ""} placeholder={carregandoPerfil ? "Consultando..." : "CPF não cadastrado"} /></div>
          </div>
          {erroPerfil && <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-destructive">{erroPerfil}</p><Button variant="outline" disabled={bloqueado} onClick={() => setTentativa((n) => n + 1)}>Consultar novamente</Button></div>}
          {destino && !carregandoPerfil && !erroPerfil && (!perfil?.nome || !perfil?.cpf) && <p className="text-sm text-muted-foreground">Nome e CPF são obtidos do usuário vinculado ao local em Cadastrar usuário. Dados ausentes ficarão em branco no termo.</p>}
        </section>
        {!grupo && <><form onSubmit={filtrar} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-72 space-y-1.5"><Label htmlFor="transferencia-codigos">Códigos RED separados por vírgulas</Label>
            <Input id="transferencia-codigos" value={busca} disabled={bloqueado || !destino} placeholder="Ex.: 60.651, 60.785, 60.789"
              onChange={(e) => { setBusca(e.target.value); setEncontrados([]); setMarcadosBusca([]); setAviso(""); setErro(""); }} /></div>
          <Button type="submit" disabled={bloqueado || !destino || !busca.trim()}>{filtrando ? "Filtrando..." : "Filtrar"}</Button>
        </form>
        <p className="text-sm text-muted-foreground">Busca exata em todas as salas acessíveis. Confira o local de origem se um código aparecer mais de uma vez. Limite de 500 bens por transferência.</p>
        {aviso && <p role="status" className="rounded-md bg-muted p-3 text-sm">{aviso}</p>}
        <TabelaBensTransferencia titulo="Bens encontrados" bens={encontrados} salas={salas} selecionados={marcadosBusca} onChange={setMarcadosBusca} disabled={bloqueado} />
        <div className="flex justify-end"><Button variant="outline" onClick={aceitar} disabled={bloqueado || !marcadosBusca.length}>Aceitar selecionados</Button></div></>}
        {grupo && <section aria-label="Informações registradas na conferência" className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium">Origem: {grupo.local}</p>
          <div className="max-h-60 overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th scope="col" className="p-3 font-semibold">Código RED</th>
                  <th scope="col" className="min-w-48 p-3 font-semibold">Local de destino da transferência</th>
                  <th scope="col" className="min-w-64 p-3 font-semibold">Observações</th>
                </tr>
              </thead>
              <tbody>
                {grupo.itens.map((item) => <tr key={item.id} className="border-t border-border align-top">
                  <th scope="row" className="p-3 font-medium">{item.codigo_red}</th>
                  <td className="whitespace-pre-wrap break-words p-3">{item.destino?.trim() || "Não informado"}</td>
                  <td className="whitespace-pre-wrap break-words p-3">{item.observacao?.trim() || "Sem observações"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>}
        <div className="space-y-3 rounded-md border-2 border-primary/30 p-3">
          <p className="font-semibold">Destino: {sala?.nome ?? "Selecione uma sala acima"}</p>
          <TabelaBensTransferencia titulo={grupo ? "Bens pendentes do local" : "Bens aceitos para transferência"} bens={aceitos} salas={salas} selecionados={marcadosSalvar} onChange={setMarcadosSalvar} disabled={bloqueado} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{grupo ? "Selecione alguns ou todos os bens usando as caixas à esquerda. Os não marcados continuam no alerta." : "Marque novamente os bens que deseja salvar. Os não marcados não serão transferidos."}</p>
            {!grupo && <Button variant="outline" disabled={bloqueado || !marcadosSalvar.length} onClick={() => { setAceitos((lista) => lista.filter((b) => !marcadosSalvar.includes(b.id))); setMarcadosSalvar([]); }}>Retirar marcados da lista</Button>}
          </div>
        </div>
        {erro && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{erro}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="font-medium">{marcadosSalvar.length} bem(ns) selecionado(s) · {aceitos.filter((b) => marcadosSalvar.includes(b.id)).reduce((s, b) => s + Number(b.valor), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          <div className="flex gap-2"><Button variant="outline" disabled={bloqueado} onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || filtrando || (!pendente && (!destino || !marcadosSalvar.length || carregandoPerfil || !!erroPerfil))}>{salvando ? "Salvando..." : pendente ? "Verificar transferência" : "Salvar transferência"}</Button></div>
        </div>
      </>
    </DialogContent>
  </Dialog>;
}
