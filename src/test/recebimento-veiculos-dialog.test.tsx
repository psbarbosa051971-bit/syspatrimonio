import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ carregar: vi.fn(), historico: vi.fn(), gravar: vi.fn(), upsert: vi.fn(), erro: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "usuario" } }, error: null }) },
    from: (tabela: string) => tabela === "recebimentos_veiculos" ? {
      select: () => ({
        eq: () => ({ maybeSingle: mocks.carregar }),
        order: () => ({ limit: mocks.historico }),
      }),
      upsert: (...args: unknown[]) => {
        mocks.upsert(...args);
        return { select: () => ({ single: mocks.gravar }) };
      },
    } : {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { nome: "12 SECRETARIA" }, error: null }) }),
        order: () => ({ range: async () => ({ data: [{ nome: "12 SECRETARIA" }], error: null }) }),
      }),
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
import { BotaoRecebimentoVeiculo, RecebimentoVeiculosDialog } from "@/components/RecebimentoVeiculosDialog";

const bem: Tables<"bens"> = {
  id: "bem-1", user_id: "usuario", sala_id: "sala-1", codigo_red: "123",
  descricao: "VEÍCULO MARCA FIAT", valor: 10000, created_at: "2026-10-13T12:00:00Z",
  conferido: true, observacao: null, incorporacao: "13/10/2026", tipo: "Aquisição",
  importacao_id: null, conferencia_finalizada: false,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.carregar.mockResolvedValue({ data: null, error: null });
  mocks.historico.mockResolvedValue({ data: [], error: null });
  mocks.gravar.mockResolvedValue({ data: {
    bem_id: bem.id, numero: 2, ano: 2026, criado_em: "2026-10-14T12:00:00Z",
    dados: {}, atualizado_por: "usuario", atualizado_em: "2026-10-14T12:00:00Z",
  }, error: null });
});

async function aguardarCarga() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Salvar recebimento e check-list" })).toBeEnabled());
}

describe("formulário de recebimento de veículos", () => {
  it("fica oculto até clicar no carrinho e não aparece para outros bens", async () => {
    const { rerender } = render(<BotaoRecebimentoVeiculo bem={{ ...bem, descricao: "Mesa" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<BotaoRecebimentoVeiculo bem={bem} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recebimento de Veículos — 123" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await aguardarCarga();
  });

  it("preenche os dados do bem, concatena os detalhes e salva o check-list junto", async () => {
    const onClose = vi.fn();
    render(<RecebimentoVeiculosDialog bem={bem} onClose={onClose} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Data cadastro")).toHaveValue("13/10/2026");
    expect(screen.getByLabelText("Modelo do veículo")).toHaveValue("VEÍCULO MARCA FIAT");
    expect(screen.getByLabelText("Incorporação")).toHaveValue("Aquisição");
    expect(screen.getByLabelText("Secretaria/Local")).toHaveValue("12 SECRETARIA");
    expect(screen.getByLabelText("Secretaria/Local")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Secretaria")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Secretaria"), { target: { value: "Secretaria da Saúde" } });
    fireEvent.change(screen.getByLabelText("Ano/modelo"), { target: { value: "2025/2026" } });
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "ABC1234" } });
    const detalhada = screen.getByRole("textbox", { name: "Descrição detalhada do veículo" });
    expect(detalhada).toHaveAttribute("aria-readonly", "true");
    expect(Array.from(detalhada.children, (linha) => linha.textContent)).toEqual([
      "VEÍCULO/MODELO: VEÍCULO MARCA FIAT", "ANO/MOD: 2025/2026", "CHASSI: ",
      "MOTOR Nº: ", "RENAVAM: ", "PLACA: ABC1234", "KM: ",
    ]);
    expect(detalhada.querySelectorAll("strong")).toHaveLength(7);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Check-list" }), { button: 0, ctrlKey: false });
    fireEvent.change(await screen.findByLabelText("Triângulo"), { target: { value: "Sim" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      bem_id: bem.id, atualizado_por: "usuario", dados: expect.objectContaining({
        secretaria: "Secretaria da Saúde", ano_modelo: "2025/2026", placa: "ABC1234", triangulo: "Sim",
      }),
    }), { onConflict: "bem_id" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("exibe reais, permite informar o dia e mantém a rolagem no check-list", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: { emissao_mes: "2026-10", valor: "339000.00" } }, error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByRole("region", { name: "Campos do recebimento e check-list" })).toHaveClass("barra-rolagem", "overflow-y-scroll", "flex-1");
    const valor = screen.getByLabelText("Valor da nota");
    expect(valor).toHaveValue("R$\u00a0339.000,00");
    fireEvent.change(valor, { target: { value: "R$ 339.000,50" } });
    const emissao = screen.getByLabelText("Emissão");
    fireEvent.focus(emissao);
    fireEvent.change(emissao, { target: { value: "1/10/2026" } });
    expect(emissao).toHaveValue("1_/10/2026");
    fireEvent.change(emissao, { target: { value: "14_/10/2026" } });
    expect(emissao).toHaveValue("14/10/2026");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Check-list" }), { button: 0, ctrlKey: false });
    expect(await screen.findByLabelText("Triângulo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      dados: expect.objectContaining({ valor: "339000.50", emissao: "2026-10-14" }),
    }), { onConflict: "bem_id" }));
  });

  it("distribui os identificadores do anexo e deixa somente a descrição no modelo", async () => {
    const descricao = "VEÍCULO MARCA FIAT MODELO UNO MILLE ECON 4 PORTAS ANO/MOD 2010/2010 PLACA HLF-2823 MOTOR ECON. 1.0 FLEX MOTOR Nº 146E1011*9856637 COR BRANCA BANHISA RENAVAM 205414427 / CHASSI Nº 9BD18522AA6449007 SEMIN";
    render(<RecebimentoVeiculosDialog bem={{ ...bem, descricao }} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Ano/modelo")).toHaveValue("2010/2010");
    expect(screen.getByLabelText("Chassi")).toHaveValue("9BD18522AA6449007");
    expect(screen.getByLabelText("Renavam")).toHaveValue("205414427");
    expect(screen.getByLabelText("Motor")).toHaveValue("146E1011*9856637");
    expect(screen.getByLabelText("Placa")).toHaveValue("HLF-2823");
    // A descrição do anexo não informa quilometragem: não inventa o valor 145.
    expect(screen.getByLabelText("KM")).toHaveValue(null);
    expect(screen.getByLabelText("Modelo do veículo")).toHaveValue(
      "VEÍCULO MARCA FIAT MODELO UNO MILLE ECON 4 PORTAS MOTOR ECON. 1.0 FLEX COR BRANCA BANHISA",
    );
    fireEvent.change(screen.getByLabelText("KM"), { target: { value: "145" } });
    expect(Array.from(screen.getByLabelText("Descrição detalhada do veículo").children, (linha) => linha.textContent)).toEqual([
      "VEÍCULO/MODELO: VEÍCULO MARCA FIAT MODELO UNO MILLE ECON 4 PORTAS MOTOR ECON. 1.0 FLEX COR BRANCA BANHISA",
      "ANO/MOD: 2010/2010", "CHASSI: 9BD18522AA6449007", "MOTOR Nº: 146E1011*9856637",
      "RENAVAM: 205414427", "PLACA: HLF-2823", "KM: 145",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      dados: expect.objectContaining({
        ano_modelo: "2010/2010", chassi: "9BD18522AA6449007", renavam: "205414427",
        motor: "146E1011*9856637", placa: "HLF-2823", km: "145",
      }),
    }), { onConflict: "bem_id" }));
  });

  it("completa campos vazios pela descrição e preserva valores já salvos", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: { placa: "XYZ1234", ano_modelo: "", km: "145" } }, error: null });
    render(<RecebimentoVeiculosDialog bem={{ ...bem, descricao: "VEÍCULO ANO/MOD 2010/2010 PLACA HLF-2823 KM 200" }} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Ano/modelo")).toHaveValue("2010/2010");
    expect(screen.getByLabelText("Placa")).toHaveValue("XYZ1234");
    expect(screen.getByLabelText("KM")).toHaveValue(145);
    expect(screen.getByLabelText("Modelo do veículo")).toHaveValue("VEÍCULO");
  });

  it("recupera o recebimento salvo sem substituir a secretaria digitada", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: { secretaria: "Outra secretaria", placa: "XYZ1234", pintura: "Regular" } }, error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Secretaria")).toHaveValue("Outra secretaria");
    expect(screen.getByLabelText("Placa")).toHaveValue("XYZ1234");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Check-list" }), { button: 0, ctrlKey: false });
    expect(await screen.findByLabelText("Pintura")).toHaveValue("Regular");
  });

  it("permite editar o modelo, a nota fiscal e a data do recebimento e recupera os valores salvos", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: {
      modelo_veiculo: "CHEVROLET SPIN LTZ 7 LUGARES", nota_fiscal: "044593", data_recebimento: "2026-06-09",
    } }, error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.queryByLabelText("Material")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("044593");
    expect(screen.getByLabelText("Data do recebimento")).toHaveValue("2026-06-09");
    expect(screen.getByLabelText("Modelo do veículo")).toHaveValue("CHEVROLET SPIN LTZ 7 LUGARES");
    expect(screen.getByLabelText("Modelo do veículo")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Modelo do veículo")).toHaveAttribute("rows", "5");
    expect(screen.getByLabelText("Chassi").parentElement).toHaveClass("sm:col-span-2");
    fireEvent.change(screen.getByLabelText("Modelo do veículo"), { target: { value: "CHEVROLET SPIN COR BRANCA" } });
    fireEvent.change(screen.getByLabelText("Nota fiscal"), { target: { value: "044594" } });
    fireEvent.change(screen.getByLabelText("Data do recebimento"), { target: { value: "2026-06-10" } });
    expect(screen.getByLabelText("Descrição detalhada do veículo")).toHaveTextContent("VEÍCULO/MODELO: CHEVROLET SPIN COR BRANCA");
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      dados: expect.objectContaining({ modelo_veiculo: "CHEVROLET SPIN COR BRANCA", nota_fiscal: "044594", data_recebimento: "2026-06-10" }),
    }), { onConflict: "bem_id" }));
  });

  it("reutiliza a secretaria mais recente nos próximos veículos e oferece os nomes já salvos", async () => {
    mocks.historico.mockResolvedValue({ data: [
      { secretaria: "Secretaria da Saúde" }, { secretaria: "Secretaria da Educação" },
      { secretaria: "Secretaria da Saúde" }, { secretaria: " " }, { secretaria: null },
    ], error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    const secretaria = screen.getByLabelText("Secretaria");
    expect(secretaria).toHaveValue("Secretaria da Saúde");
    expect(secretaria).toHaveAttribute("list", "secretarias-recebimento");
    expect(Array.from(document.querySelectorAll("#secretarias-recebimento option"), (opcao) => opcao.getAttribute("value")))
      .toEqual(["Secretaria da Saúde", "Secretaria da Educação"]);
    expect(screen.getByLabelText("Fornecedor").parentElement).toHaveClass("sm:col-span-3");
    fireEvent.change(secretaria, { target: { value: "Secretaria da Educação" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      dados: expect.objectContaining({ secretaria: "Secretaria da Educação" }),
    }), { onConflict: "bem_id" }));
  });

  it("mantém a secretaria deste patrimônio mesmo quando outro nome foi usado depois", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: { secretaria: "Secretaria da Educação" } }, error: null });
    mocks.historico.mockResolvedValue({ data: [{ secretaria: "Secretaria da Saúde" }], error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Secretaria")).toHaveValue("Secretaria da Educação");
  });

  it("permite preencher o recebimento mesmo se as sugestões de secretaria falharem", async () => {
    mocks.historico.mockResolvedValue({ data: null, error: { message: "Falha no histórico" } });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Secretaria")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserva o antigo conteúdo de Material no campo Nota fiscal", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: { material: "044593" } }, error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("044593");
  });

  it("exibe o número do termo existente e salva os dados da comissão", async () => {
    mocks.carregar.mockResolvedValue({ data: {
      bem_id: bem.id, numero: 2, ano: 2026, dados: { portaria: "310/2026", assinante_1: "Presidente" },
    }, error: null });
    const onSaved = vi.fn();
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} onSaved={onSaved} />);
    await aguardarCarga();
    expect(screen.getByText("Termo Nº 002/2026")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Termo e assinaturas" }), { button: 0, ctrlKey: false });
    expect(await screen.findByLabelText("Portaria da comissão (nº/ano)")).toHaveValue("310/2026");
    expect(screen.getByLabelText("Nome / matrícula 1")).toHaveValue("Presidente");
    fireEvent.change(screen.getByLabelText("Observações gerais / conclusão da comissão"), { target: { value: "Inspeção concluída sem ressalvas." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      dados: expect.objectContaining({ portaria: "310/2026", local_fisico: "12 SECRETARIA", observacoes_gerais: "Inspeção concluída sem ressalvas." }),
    }), { onConflict: "bem_id" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.sucesso).toHaveBeenCalledWith("Termo de recebimento Nº 002/2026 salvo.");
  });

  it("bloqueia a gravação após falha ao carregar e permite tentar novamente", async () => {
    mocks.carregar.mockResolvedValueOnce({ data: null, error: { message: "Falha" } });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o recebimento.");
    expect(screen.getByRole("button", { name: "Salvar recebimento e check-list" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await aguardarCarga();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
