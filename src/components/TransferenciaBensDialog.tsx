import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { responsavelDoLocal } from "@/lib/usuarios.functions";
import { formatarCpf } from "@/lib/cpf";
import { htmlDoTermo, numeroDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";
import { aceitarBens, buscarBensTransferencia, carregarSalasTransferencia, codigosDaBusca, lerTermoTransferencia, type BemTransferencia, type SalaTransferencia } from "@/lib/transferencias";
import { SeletorLocalFisico } from "@/components/SeletorLocalFisico";
import { TabelaBensTransferencia } from "@/components/TabelaBensTransferencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { onClose: () => void; onSaved: (salaId: string, termoId: string) => void };

export function TransferenciaBensDialog({ onClose, onSaved }: Props) {
  const consultarResponsavel = useServerFn(responsavelDoLocal);
  const [salas, setSalas] = useState<SalaTransferencia[]>([]);
  const [carregandoSalas, setCarregandoSalas] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [erroSalas, setErroSalas] = useState("");
  const [destino, setDestino] = useState("");
  const [perfil, setPerfil] = useState<{ nome: string | null; cpf: string | null } | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [erroPerfil, setErroPerfil] = useState("");
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<BemTransferencia[]>([]);
  const [marcadosBusca, setMarcadosBusca] = useState<string[]>([]);
  const [aceitos, setAceitos] = useState<BemTransferencia[]>([]);
  const [marcadosSalvar, setMarcadosSalvar] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [filtrando, setFiltrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [termo, setTermo] = useState<TermoResponsabilidade | null>(null);
  const [pronto, setPronto] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const operacao = useRef(false);
  const pedido = useRef<{ id: string; destino: string; itens: { id: string; sala_id: string | null }[] } | null>(null);
  const sala = salas.find((s) => s.id === destino);
  const bloqueado = salvando || filtrando || pendente;
  const documento = useMemo(() => termo ? htmlDoTermo(termo) : "", [termo]);

  useEffect(() => {
    let ativo = true;
    setCarregandoSalas(true); setErroSalas("");
    carregarSalasTransferencia().then((dados) => { if (ativo) setSalas(dados); })
      .catch(() => { if (ativo) setErroSalas("Não foi possível carregar as salas de destino."); })
      .finally(() => { if (ativo) setCarregandoSalas(false); });
    return () => { ativo = false; };
  }, [tentativa]);

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
    setAceitos([]); setMarcadosSalvar([]); setAviso(""); setErro(""); setPerfil(null);
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
      setTermo(gerado); setPendente(false); setPronto(false);
      onSaved(atual.destino, gerado.id);
      toast.success("Transferência realizada. Confira o termo de responsabilidade.");
    } catch {
      setPendente(true);
      setErro("Não foi possível confirmar o resultado. Clique em Verificar transferência para consultar o mesmo pedido com segurança, sem repetir a movimentação.");
    } finally { operacao.current = false; setSalvando(false); }
  }

  function imprimir() {
    try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); }
    catch { toast.error("O navegador não permitiu a impressão. Tente abrir o sistema fora da prévia incorporada."); }
  }

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando && !filtrando && !pendente) onClose(); }}>
    <DialogContent onInteractOutside={(e) => e.preventDefault()} className="flex max-h-[94vh] w-[96vw] max-w-6xl flex-col overflow-y-auto [&_input:not([type=checkbox])]:text-base [&_label]:text-base">
      <DialogHeader>
        <DialogTitle>{termo ? `Transferência realizada — Termo ${numeroDoTermo(termo)}` : "Gerar transferência"}</DialogTitle>
        <DialogDescription>{termo ? "Os bens foram movidos para a sala de destino. O termo contém somente os bens salvos nesta transferência." : "Escolha o destino, filtre os códigos RED e aceite os bens. A movimentação só será realizada após a segunda seleção e o salvamento."}</DialogDescription>
      </DialogHeader>
      {termo ? <>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button disabled={!pronto} onClick={imprimir}>Imprimir / Salvar PDF</Button>
        </div>
        <iframe ref={frame} title={`Termo de responsabilidade ${numeroDoTermo(termo)}`} sandbox="allow-same-origin allow-modals"
          srcDoc={documento} onLoad={() => setPronto(true)} className="h-[65vh] w-full rounded-md border bg-background" />
      </> : <>
        <section className="space-y-3 rounded-md border-2 border-primary/30 bg-accent p-4" aria-label="Destino da transferência">
          <div className="space-y-1.5"><Label htmlFor="transferencia-destino">Local / sala de destino</Label>
            {carregandoSalas ? <p role="status">Carregando salas...</p> : erroSalas ? <div role="alert"><p className="text-destructive">{erroSalas}</p><Button variant="outline" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button></div> : <SeletorLocalFisico
              id="transferencia-destino" salas={salas} valor={destino ? [destino] : []} onChange={escolherDestino} disabled={bloqueado} />}
          </div>
          <p className="text-sm text-muted-foreground">Ao trocar o destino, as duas listas são limpas para evitar uma transferência para a sala errada.</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5"><Label htmlFor="transferencia-responsavel">Nome do responsável</Label>
              <Input id="transferencia-responsavel" readOnly value={perfil?.nome ?? sala?.responsavel ?? ""} placeholder={carregandoPerfil ? "Consultando responsável..." : "Responsável não cadastrado"} /></div>
            <div className="space-y-1.5"><Label htmlFor="transferencia-cpf">CPF</Label>
              <Input id="transferencia-cpf" readOnly value={perfil?.cpf ? formatarCpf(perfil.cpf) : ""} placeholder={carregandoPerfil ? "Consultando..." : "CPF não cadastrado"} /></div>
          </div>
          {erroPerfil && <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-destructive">{erroPerfil}</p><Button variant="outline" disabled={bloqueado} onClick={() => setTentativa((n) => n + 1)}>Consultar novamente</Button></div>}
          {destino && !carregandoPerfil && !erroPerfil && (!perfil?.nome || !perfil?.cpf) && <p className="text-sm text-muted-foreground">Nome e CPF são obtidos do usuário vinculado ao local em Cadastrar usuário. Dados ausentes ficarão em branco no termo.</p>}
        </section>
        <form onSubmit={filtrar} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-72 space-y-1.5"><Label htmlFor="transferencia-codigos">Códigos RED separados por vírgulas</Label>
            <Input id="transferencia-codigos" value={busca} disabled={bloqueado || !destino} placeholder="Ex.: 12345, 67890, 13579"
              onChange={(e) => { setBusca(e.target.value); setEncontrados([]); setMarcadosBusca([]); setAviso(""); setErro(""); }} /></div>
          <Button type="submit" disabled={bloqueado || !destino || !busca.trim()}>{filtrando ? "Filtrando..." : "Filtrar"}</Button>
        </form>
        <p className="text-sm text-muted-foreground">Busca exata em todas as salas acessíveis. Confira o local de origem se um código aparecer mais de uma vez. Limite de 500 bens por transferência.</p>
        {aviso && <p role="status" className="rounded-md bg-muted p-3 text-sm">{aviso}</p>}
        <TabelaBensTransferencia titulo="Bens encontrados" bens={encontrados} salas={salas} selecionados={marcadosBusca} onChange={setMarcadosBusca} disabled={bloqueado} />
        <div className="flex justify-end"><Button variant="outline" onClick={aceitar} disabled={bloqueado || !marcadosBusca.length}>Aceitar selecionados</Button></div>
        <div className="space-y-3 rounded-md border-2 border-primary/30 p-3">
          <p className="font-semibold">Destino: {sala?.nome ?? "Selecione uma sala acima"}</p>
          <TabelaBensTransferencia titulo="Bens aceitos para transferência" bens={aceitos} salas={salas} selecionados={marcadosSalvar} onChange={setMarcadosSalvar} disabled={bloqueado} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Marque novamente os bens que deseja salvar. Os não marcados não serão transferidos.</p>
            <Button variant="outline" disabled={bloqueado || !marcadosSalvar.length} onClick={() => { setAceitos((lista) => lista.filter((b) => !marcadosSalvar.includes(b.id))); setMarcadosSalvar([]); }}>Retirar marcados da lista</Button>
          </div>
        </div>
        {erro && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{erro}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="font-medium">{marcadosSalvar.length} bem(ns) selecionado(s) · {aceitos.filter((b) => marcadosSalvar.includes(b.id)).reduce((s, b) => s + Number(b.valor), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          <div className="flex gap-2"><Button variant="outline" disabled={bloqueado} onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || filtrando || (!pendente && (!destino || !marcadosSalvar.length || carregandoPerfil || !!erroPerfil))}>{salvando ? "Salvando..." : pendente ? "Verificar transferência" : "Salvar transferência"}</Button></div>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
