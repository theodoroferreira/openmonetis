# Servidor MCP e Grok Bot

O OpenMonetis expõe suas finanças por um servidor MCP em `/api/mcp`. Este guia
mostra como conectar o Grok Bot e como agendar a rotina diária.

O sync do Open Finance continua no cron da VPS, às 7h. A rotina só decide o que
fazer com o que chegou na inbox.

## Conectar

1. Em **Ajustes > Automação**, crie um token. Ele começa com `opm_` e só aparece
   uma vez.
2. No cliente MCP, use o endereço mostrado na aba, com Streamable HTTP, e o
   cabeçalho `Authorization: Bearer <token>`.
3. Chame a ferramenta `ping` para confirmar.

Token do Companion não funciona aqui. O contrário ainda acontece: `/api/inbox` e
`/api/pluggy/sync` não checam escopo e aceitam token do MCP. O limite é de 120
requisições por minuto, por token.

Para testar sem cliente:

```bash
curl -s https://seu-dominio/api/mcp \
  -H "Authorization: Bearer opm_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
```

## Validar antes de confiar (Fase 0)

Duas coisas só podem ser confirmadas no Grok Bot e ainda não foram testadas:

1. Ele conecta por URL com cabeçalho `Authorization: Bearer`.
2. Uma Routine agendada chama as ferramentas **sem você presente**, sem cartão
   de aprovação.

Se a autenticação falhar, o caminho é adicionar OAuth com
`@better-auth/oauth-provider`. Se a execução sem supervisão falhar, a alternativa
é um cron na VPS chamando a API da xAI com MCP remoto, que exige chave e tem
custo por uso.

## Rotina das 7h30

Comece com `dry_run: true` e troque para `false` depois de conferir os resumos.

```text
Você cuida dos lançamentos diários do OpenMonetis. Rode sem pedir confirmação.

1. Chame get_decision_history com months = 3.
2. Chame settle_invoice_payment_items com dry_run = true.
3. Chame list_inbox com status = pending, passando por todas as páginas.
4. Para cada item sem pluggyFlag, procure no histórico o grupo com a mesma
   descrição. Considere claro um padrão com pelo menos 3 ocorrências e a mesma
   categoria e o mesmo destino em pelo menos 80% delas.
5. Chame approve_inbox_items com dry_run = true para os itens com padrão claro,
   em lotes de até 50. Em overrides, informe categoria, conta ou cartão, forma
   de pagamento e pessoa quando o padrão indicar.
6. Não invente categoria. Sem padrão claro, deixe o item pendente.
7. Nunca crie lançamento para pagamento de fatura nem para parcelas.

Termine com um resumo: quantos itens seriam aprovados, quais ficaram pendentes
e por quê, e cada divergência de fatura com o valor e as faturas candidatas.
```

## O que o servidor garante

O modelo pode errar, então estas regras ficam no servidor:

- **Pagamento de fatura** nunca vira despesa, mesmo com `overrides`. O item é
  descartado, e a fatura é paga só quando o valor bate com o total calculado no
  servidor. Divergência fica pendente e volta no retorno.
- **Parcelas** são recusadas: o valor recebido é o da parcela, e a série pode já
  existir.
- **Aprovação repetida** cria um único lançamento, mesmo em paralelo.
- **Exclusão em cascata** de conta, cartão, categoria, pessoa e conexão exige
  `confirm` com o nome exato e guarda um snapshot na auditoria.
- **E-mails automáticos** não são enviados para lançamentos do bot. Só
  `send_payer_summary` envia e-mail.
- **Editar** preserva o que não foi informado.
- **Transferência** é excluída sempre com as duas pernas, juntas.

## Risco: texto de banco é entrada não confiável

Descrições de Pix e transferências chegam à inbox escritas por terceiros, e o
modelo lê esse texto. Alguém pode mandar um Pix de centavos com uma instrução na
descrição, tentando fazer o bot editar ou apagar dados. As regras acima não
impedem isso: `confirm` protege de engano do modelo, não de instrução
maliciosa, porque o nome exato pode ser lido por ele.

Por isso a rotina diária não deve ter acesso às ferramentas de exclusão. Se o
cliente permitir escolher ferramentas, libere só as que ela usa:
`get_decision_history`, `list_inbox`, `settle_invoice_payment_items`,
`approve_inbox_items`, `list_categories`, `list_accounts`, `list_cards` e
`list_payers`.

## Acompanhar e desfazer

**Ajustes > Automação** mostra as últimas alterações do bot e um botão para
desfazer cada aprovação: o lançamento é excluído e o item volta para a inbox.
Pelo MCP, a mesma ação é `undo_inbox_approval`. Só aprovações feitas pelo bot
podem ser desfeitas assim.

## Implantação gradual

1. **Teste retroativo.** Use `get_decision_history` com `before` e
   `approve_inbox_items` com `dry_run` em itens já decididos, e compare com o que
   você fez. O `dry_run` aceita itens que não estão mais pendentes.
2. **Primeira semana.** Rotina em `dry_run`, só com resumo.
3. **Escrita liberada.** Troque `dry_run` para `false`.

Antes de liberar exclusões em produção, confirme que existe um backup diário
ativo ou agende `pnpm backup`.

## Limitações

- O histórico liga item e lançamento pela descrição, porque `lancamento_id` nunca
  tinha sido preenchido. Aprovações do bot passam a preencher esse campo.
- Não ficam expostos pelo MCP: senha, e-mail, exclusão ou reset do usuário,
  tokens, compartilhamento de pessoas, upload de anexos, importação OFX, widgets,
  logos e preferências de tela.
