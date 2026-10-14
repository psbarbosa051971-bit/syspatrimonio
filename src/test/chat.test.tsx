import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "@/components/Chat";

const estado = vi.hoisted(() => ({
  enviar: vi.fn(),
  excluir: vi.fn(),
  setSelecionada: vi.fn(),
  mensagens: [] as Array<{ id: number; autor_id: string; conteudo: string; criado_em: string }>,
  selecionada: null as string | null,
  recebida: null as { id: number; conversa_id: string } | null,
  erro: "",
}));
vi.mock("@/hooks/use-chat", () => ({
  useChat: () => ({
    conversas: [{ user_id: "usuario-1", nome: "Maria", criado_em: "2026-01-01T12:00:00Z" }],
    selecionada: estado.selecionada,
    setSelecionada: estado.setSelecionada,
    mensagens: estado.mensagens,
    recebida: estado.recebida,
    carregando: false,
    enviando: false,
    erro: estado.erro,
    enviar: estado.enviar,
    excluir: estado.excluir,
    excluindo: null,
    temAnteriores: false,
    carregarAnteriores: vi.fn(),
  }),
}));

beforeEach(() => {
  estado.enviar.mockReset().mockResolvedValue(true);
  estado.excluir.mockReset().mockResolvedValue(true);
  estado.setSelecionada.mockReset();
  estado.selecionada = null;
  estado.recebida = null;
  estado.mensagens = [];
  estado.erro = "";
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Chat flutuante", () => {
  it.each(["operador", "visualizador"] as const)("mostra a saudação automática para %s", (role) => {
    render(<Chat userId="usuario-1" role={role} />);
    expect(screen.getByText("Olá! Seja muito bem-vindo(a) ao Departamento de Patrimônio! ✨ É um prazer receber o seu contato. Por favor, aguarde um momento que em instantes iremos atender você.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Excluir mensagem automática" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Olá! Seja muito bem-vindo/));
    fireEvent.click(screen.getByRole("button", { name: "Excluir mensagem automática" }));
    expect(screen.queryByText(/Olá! Seja muito bem-vindo/)).not.toBeInTheDocument();
  });

  it("não mostra a saudação automática ao administrador", () => {
    estado.selecionada = "usuario-1";
    render(<Chat userId="admin-1" role="admin" />);
    expect(screen.queryByText(/Olá! Seja muito bem-vindo/)).not.toBeInTheDocument();
  });

  it("encerra a janela sem apagar o histórico e permite reabrir", () => {
    estado.mensagens = [{ id: 20, autor_id: "usuario-1", conteudo: "Histórico mantido", criado_em: "2026-01-01T12:00:00Z" }];
    render(<Chat userId="usuario-1" role="operador" />);
    const encerrar = screen.getByRole("button", { name: "Encerrar bate-papo" });
    expect(encerrar.nextElementSibling).toHaveTextContent("Enviar");
    fireEvent.click(encerrar);
    expect(screen.queryByRole("region", { name: "Chat com o administrador" })).not.toBeInTheDocument();
    expect(estado.excluir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByText("Histórico mantido")).toBeVisible();
  });

  it.each(["usuario-1", "admin-1"])("mostra o X ao clicar na mensagem de %s e exclui só a escolhida", async (autor_id) => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    estado.mensagens = [{ id: 21, autor_id, conteudo: "Mensagem escolhida", criado_em: "2026-01-01T12:00:00Z" }];
    render(<Chat userId="usuario-1" role="visualizador" />);
    expect(screen.queryByRole("button", { name: "Excluir mensagem 21" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Mensagem escolhida"));
    fireEvent.click(screen.getByRole("button", { name: "Excluir mensagem 21" }));
    await waitFor(() => expect(estado.excluir).toHaveBeenCalledWith(21));
    expect(confirmar).toHaveBeenCalled();
  });

  it("não exclui a mensagem quando a confirmação é cancelada", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    estado.mensagens = [{ id: 22, autor_id: "usuario-1", conteudo: "Não apagar", criado_em: "2026-01-01T12:00:00Z" }];
    render(<Chat userId="usuario-1" role="operador" />);
    fireEvent.click(screen.getByText("Não apagar"));
    fireEvent.click(screen.getByRole("button", { name: "Excluir mensagem 22" }));
    expect(estado.excluir).not.toHaveBeenCalled();
    expect(screen.getByText("Não apagar")).toBeVisible();
  });

  it.each(["operador", "visualizador"] as const)("permite que %s envie sem clicar no botão Chat", async (role) => {
    render(<Chat userId="usuario-1" role={role} />);
    expect(screen.getByRole("region", { name: "Chat com o administrador" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Conversas")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Olá, administrador" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(estado.enviar).toHaveBeenCalledWith("Olá, administrador"));
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toHaveValue(""));
  });

  it("mostra ao administrador a lista de conversas sem abrir um modal", () => {
    render(<Chat userId="admin-1" role="admin" />);
    fireEvent.click(screen.getByRole("button", { name: /Maria/ }));
    expect(estado.setSelecionada).toHaveBeenCalledWith("usuario-1");
  });

  it("não mostra o chat enquanto o perfil não foi identificado", () => {
    render(<Chat userId="usuario-1" role={null} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chat" })).not.toBeInTheDocument();
  });

  it("mantém o texto se o envio falhar", async () => {
    estado.enviar.mockResolvedValue(false);
    render(<Chat userId="usuario-1" role="operador" />);
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Minha dúvida" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(estado.enviar).toHaveBeenCalled());
    expect(screen.getByLabelText("Mensagem")).toHaveValue("Minha dúvida");
  });

  it("reabre automaticamente ao receber uma nova mensagem e permite responder", async () => {
    const { rerender } = render(<Chat userId="usuario-1" role="operador" />);
    fireEvent.click(screen.getByRole("button", { name: "Minimizar chat" }));
    expect(screen.queryByRole("region", { name: "Chat com o administrador" })).not.toBeInTheDocument();
    estado.recebida = { id: 10, conversa_id: "usuario-1" };
    estado.mensagens = [{ id: 10, autor_id: "admin-1", conteudo: "Como posso ajudar?", criado_em: "2026-01-01T12:00:00Z" }];
    rerender(<Chat userId="usuario-1" role="operador" />);
    expect(screen.getByText("Como posso ajudar?")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Preciso de ajuda" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(estado.enviar).toHaveBeenCalledWith("Preciso de ajuda"));
  });

  it("seleciona automaticamente a conversa recebida pelo administrador", () => {
    const { rerender } = render(<Chat userId="admin-1" role="admin" />);
    fireEvent.click(screen.getByRole("button", { name: "Minimizar chat" }));
    estado.recebida = { id: 11, conversa_id: "usuario-1" };
    rerender(<Chat userId="admin-1" role="admin" />);
    expect(estado.setSelecionada).toHaveBeenCalledWith("usuario-1");
    expect(screen.getByRole("region", { name: "Chat — atendimento" })).toBeVisible();
  });

  it("não troca a conversa nem apaga o rascunho durante outra resposta", () => {
    estado.selecionada = "usuario-1";
    const { rerender } = render(<Chat userId="admin-1" role="admin" />);
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Estou verificando" } });
    estado.recebida = { id: 12, conversa_id: "usuario-2" };
    rerender(<Chat userId="admin-1" role="admin" />);
    expect(estado.setSelecionada).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mensagem")).toHaveValue("Estou verificando");
    expect(screen.getByRole("status")).toHaveTextContent("Nova mensagem");
  });
});
