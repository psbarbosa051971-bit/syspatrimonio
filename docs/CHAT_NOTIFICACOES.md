# Avisos do chat fora do sistema

## Publicação necessária no Lovable

As tabelas e o disparo automático no banco já foram preparados. Para entregar avisos, o Lovable também precisa publicar a função de servidor `chat-push`, em `supabase/functions/chat-push/index.ts`, respeitando `supabase/config.toml`. Apenas sincronizar os arquivos da interface não confirma a publicação dessa função.

Solicitação que pode ser feita no Lovable: **“Publique a função chat-push e verifique o envio das notificações do chat.”**

Não é necessário fornecer uma chave de notificações externa: o serviço cria o par de chaves na primeira ativação e guarda a chave privada em uma tabela acessível somente pelo servidor. A função usa as credenciais internas padrão do ambiente Supabase; nenhuma chave privada deve ir para a interface.

## Como ativar

1. Abra o endereço publicado do sistema em uma aba própria, fora do editor.
2. Entre na conta que receberá os avisos.
3. No chat, expanda **Receber avisos mesmo com o sistema fechado**.
4. Clique em **Ativar avisos neste computador** e permita as notificações do navegador.
5. Repita em cada navegador/computador que deverá receber os avisos, inclusive os dos administradores.

A interface só informa que os avisos estão ativados depois da confirmação do servidor. Se a função ainda não estiver publicada, ela informa a falha e permite tentar novamente.

## Destinatários e privacidade

- Mensagem de operador/visualizador: avisa os administradores cadastrados para receber notificações.
- Resposta de administrador: avisa o operador/visualizador daquela conversa.
- O remetente não recebe o próprio aviso.
- O aviso é genérico e não revela o texto da conversa. É necessário entrar no sistema para ler e responder.
- Sair da conta não desativa os avisos, pois esse é o objetivo do recurso. Em computador compartilhado, use **Desativar avisos neste computador** antes de sair.
- Ao entrar com outra conta no mesmo navegador, a assinatura existente é reassociada à nova conta, se o servidor confirmar a atualização.

## Limites do navegador

Não é necessário manter a página do sistema aberta nem a sessão conectada. Entretanto, o computador precisa estar conectado à internet e o navegador/sistema operacional precisam permitir notificações. O modo Não Perturbe, configurações corporativas, economia de energia e o encerramento completo do navegador podem impedir ou adiar o aviso. Não há garantia de entrega instantânea, nem entrega com o computador desligado. No iPhone/iPad compatível, o site deve ser adicionado à Tela de Início e aberto por lá.

## Verificação após publicar

1. Ative os avisos em dois perfis de navegador: um administrador e um operador/visualizador.
2. Saia da conta e feche a aba do operador/visualizador; envie uma resposta pelo administrador.
3. Confirme o aviso no computador do destinatário e o pedido de login ao clicar nele.
4. Repita no sentido contrário, deixando o administrador desconectado.
5. Desative os avisos e confirme que aquele navegador deixa de recebê-los.

Os testes adicionados cobrem os controles da interface, a solicitação de permissão e a confirmação de ativação/desativação pelo servidor. A entrega real depende da função publicada e das permissões de cada aparelho; deve ser verificada no ambiente publicado.
