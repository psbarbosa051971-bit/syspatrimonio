import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";

const banco = vi.hoisted(() => ({
  ultima: null as { id: number; conversa_id: string } | null,
  falha: false,
  from: vi.fn(),
  neq: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: banco.from },
}));

beforeEach(() => {
  vi.useFakeTimers();
  banco.ultima = null;
  banco.falha = false;
  banco.neq.mockReset();
  banco.from.mockReset().mockImplementation(() => {
    const consulta: Record<"select" | "neq" | "order" | "limit", ReturnType<typeof vi.fn>> = {
      select: vi.fn(() => consulta),
      neq: banco.neq.mockImplementation(() => consulta),
      order: vi.fn(() => consulta),
      limit: vi.fn(async () => ({
        data: banco.ultima ? [banco.ultima] : [],
        error: banco.falha ? new Error("Sem conexão") : null,
      })),
    };
    return consulta;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Recebimento de mensagens com o chat minimizado", () => {
  it("ignora o histórico inicial e detecta uma nova mensagem sem abrir o chat", async () => {
    banco.ultima = { id: 5, conversa_id: "usuario-1" };
    const { result, unmount } = renderHook(() => useChat("usuario-1", false, false));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.recebida).toBeNull();
    expect(banco.neq).toHaveBeenCalledWith("autor_id", "usuario-1");

    banco.ultima = { id: 6, conversa_id: "usuario-1" };
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recebida).toEqual({ id: 6, conversa_id: "usuario-1" });
    const recebida = result.current.recebida;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recebida).toBe(recebida);

    unmount();
    const consultas = banco.from.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(banco.from).toHaveBeenCalledTimes(consultas);
  });

  it("detecta a primeira mensagem em uma conversa vazia", async () => {
    const { result } = renderHook(() => useChat("admin-1", true, false));
    await act(async () => { await Promise.resolve(); });
    banco.ultima = { id: 1, conversa_id: "usuario-1" };
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recebida?.conversa_id).toBe("usuario-1");
  });

  it("continua verificando depois de uma falha de conexão", async () => {
    const { result } = renderHook(() => useChat("usuario-1", false, false));
    await act(async () => { await Promise.resolve(); });
    banco.falha = true;
    banco.ultima = { id: 2, conversa_id: "usuario-1" };
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recebida).toBeNull();
    banco.falha = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recebida?.id).toBe(2);
  });
});
