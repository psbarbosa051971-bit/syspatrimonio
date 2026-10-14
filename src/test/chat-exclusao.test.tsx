import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";

const banco = vi.hoisted(() => ({
  from: vi.fn(),
  excluir: vi.fn(),
  eq: vi.fn(),
  retorno: { data: [{ id: 42 }] as { id: number }[] | null, error: null as Error | null },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: banco.from } }));

beforeEach(() => {
  banco.retorno = { data: [{ id: 42 }], error: null };
  banco.excluir.mockReset();
  banco.eq.mockReset();
  banco.from.mockReset().mockImplementation(() => {
    const remocao = {
      eq: banco.eq.mockImplementation(() => remocao),
      select: vi.fn(async () => banco.retorno),
    };
    const consulta = {
      select: vi.fn(() => consulta),
      neq: vi.fn(() => consulta),
      order: vi.fn(() => consulta),
      limit: vi.fn(async () => ({ data: [], error: null })),
      delete: banco.excluir.mockImplementation(() => remocao),
    };
    return consulta;
  });
});
afterEach(cleanup);

describe("Exclusão individual do chat", () => {
  it("restringe a exclusão ao ID e à conversa do usuário", async () => {
    const { result } = renderHook(() => useChat("usuario-1", false, false));
    let sucesso = false;
    await act(async () => { sucesso = await result.current.excluir(42); });
    expect(sucesso).toBe(true);
    expect(banco.from).toHaveBeenCalledWith("chat_mensagens");
    expect(banco.eq).toHaveBeenCalledWith("id", 42);
    expect(banco.eq).toHaveBeenCalledWith("conversa_id", "usuario-1");
    expect(result.current.excluindo).toBeNull();
  });

  it("exige uma conversa selecionada pelo administrador", async () => {
    const { result } = renderHook(() => useChat("admin-1", true, false));
    await act(async () => { expect(await result.current.excluir(42)).toBe(false); });
    expect(banco.excluir).not.toHaveBeenCalled();
    act(() => result.current.setSelecionada("usuario-2"));
    await act(async () => { expect(await result.current.excluir(42)).toBe(true); });
    expect(banco.eq).toHaveBeenCalledWith("conversa_id", "usuario-2");
  });

  it.each(["sem permissão", "sem mensagem"])("informa a falha: %s", async (cenario) => {
    banco.retorno = { data: [], error: cenario === "sem permissão" ? new Error("Negado") : null };
    const { result } = renderHook(() => useChat("usuario-1", false, false));
    await act(async () => { expect(await result.current.excluir(42)).toBe(false); });
    expect(result.current.erro).toBe("Não foi possível excluir a mensagem. Tente novamente.");
    expect(result.current.excluindo).toBeNull();
  });
});
