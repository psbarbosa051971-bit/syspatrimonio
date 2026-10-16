import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataAtualRecebimento } from "@/lib/checklist-veiculos";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), single: vi.fn(), historico: vi.fn(), sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "usuario" } }, error: null }) },
    from: (tabela: string) => {
      if (tabela !== "checklists_veiculos") throw new Error("Não deve criar um termo antes da associação");
      return {
        select: () => ({ order: () => ({ limit: mocks.historico }) }),
        insert: (valores: unknown) => { mocks.insert(valores); return { select: () => ({ single: mocks.single }) }; },
        update: (valores: unknown) => { mocks.update(valores); return { eq: () => ({ is: () => ({ select: () => ({ single: mocks.single }) }) }) }; },
      };
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
vi.mock("@/components/ChaveAcessoNfe", () => ({ ChaveAcessoNfe: () => <div>Leitura da NF-e</div> }));
import { ChecklistVeiculoDialog } from "@/components/ChecklistVeiculoDialog";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.single.mockResolvedValue({ data: { id: "checklist-1" }, error: null });
  mocks.historico.mockResolvedValue({ data: [], error: null });
});

describe("checklist vazio antes da importação do veículo", () => {
  it("abre sem dados do patrimônio e somente com a data atual preenchida", () => {
    render(<ChecklistVeiculoDialog checklist={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Data do recebimento")).toHaveValue(dataAtualRecebimento());
    for (const campo of ["Nota fiscal", "Emissão", "Pedido", "Empenho", "Fornecedor", "Modelo do veículo", "Chassi"]) {
      expect(screen.getByLabelText(campo)).toHaveValue("");
    }
    expect(screen.getByLabelText("Ano empenho")).toHaveValue(null);
    expect(screen.getByLabelText("Triângulo")).toHaveValue("");
  });

  it("mostra a instalação dentro do cabeçalho do formulário do aplicativo", () => {
    render(<ChecklistVeiculoDialog checklist={null} mostrarInstalacao onClose={vi.fn()} onSaved={vi.fn()} />);
    const cabecalho = screen.getByRole("heading", { name: "Novo checklist de veículo" }).parentElement!;
    const instalar = within(cabecalho).getByRole("button", { name: "Instalar aplicativo" });
    expect(instalar).toHaveClass("w-full", "sm:w-auto");
    expect(screen.getAllByRole("button", { name: "Instalar aplicativo" })).toHaveLength(1);
    fireEvent.click(instalar);
    expect(screen.getByRole("heading", { name: "Instalar SysPatrimônio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Android — Chrome" })).toBeInTheDocument();
  });

  it("mantém dois campos por linha no celular nas quatro seções do checklist", () => {
    render(<ChecklistVeiculoDialog checklist={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    for (const titulo of ["Acessórios/equipamentos", "Acessórios especiais", "Ferramentas", "Estado do veículo"]) {
      const grade = screen.getByRole("heading", { name: titulo }).nextElementSibling;
      expect(grade).toHaveClass("grid", "grid-cols-2", "lg:grid-cols-3");
      for (const campo of grade!.querySelectorAll("label")) {
        expect(campo).toHaveClass("min-w-0");
        expect(campo.querySelector("select")).toHaveClass("w-full", "min-w-0");
      }
    }
  });

  it("salva o preenchimento sem bem, sem número e sem emitir um termo", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ChecklistVeiculoDialog checklist={null} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Nota fiscal"), { target: { value: "45593" } });
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Fornecedor de veículos" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "91983.50" } });
    fireEvent.change(screen.getByLabelText("Triângulo"), { target: { value: "Sim" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar checklist sem patrimônio" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "usuario", dados: {
      data_recebimento: dataAtualRecebimento(), nota_fiscal: "45593", fornecedor: "Fornecedor de veículos", valor: "91983.50", triangulo: "Sim",
    } });
    expect(onClose).toHaveBeenCalled();
  });

  it("reutiliza o último fornecedor salvo em um novo checklist e permite alterá-lo", async () => {
    mocks.historico.mockResolvedValue({ data: [{ fornecedor: "Fornecedor salvo" }], error: null });
    render(<ChecklistVeiculoDialog checklist={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor salvo"));
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Outro fornecedor" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar checklist sem patrimônio" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      dados: expect.objectContaining({ fornecedor: "Outro fornecedor" }),
    })));
  });

  it("mantém os dados no formulário quando o salvamento falha", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Falha de conexão" } });
    const onClose = vi.fn();
    render(<ChecklistVeiculoDialog checklist={null} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nota fiscal"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar checklist sem patrimônio" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalled());
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("123");
    expect(onClose).not.toHaveBeenCalled();
  });
});
