import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataAtualRecebimento } from "@/lib/checklist-veiculos";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), single: vi.fn(), sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "usuario" } }, error: null }) },
    from: (tabela: string) => {
      if (tabela !== "checklists_veiculos") throw new Error("Não deve criar um termo antes da associação");
      return {
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

  it("salva o preenchimento sem bem, sem número e sem emitir um termo", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ChecklistVeiculoDialog checklist={null} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Nota fiscal"), { target: { value: "45593" } });
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Fornecedor de veículos" } });
    fireEvent.change(screen.getByLabelText("Triângulo"), { target: { value: "Sim" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar checklist sem patrimônio" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "usuario", dados: {
      data_recebimento: dataAtualRecebimento(), nota_fiscal: "45593", fornecedor: "Fornecedor de veículos", triangulo: "Sim",
    } });
    expect(onClose).toHaveBeenCalled();
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
