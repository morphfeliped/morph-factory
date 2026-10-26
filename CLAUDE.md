# Fábrica de produtos Morph — instruções do orquestrador

Este repositório é a **fábrica**: a partir de um briefing, agentes criam um produto novo da Morph
(bot de WhatsApp com IA rodando no n8n) para um segmento (vertical). Leia o `README.md` só se precisar
de contexto extra.

- **core/** — parte genérica do bot. `contrato-core.md` é a especificação que todo vertical segue.
- **verticais/** — um pacote por segmento (prompt + tools). `odonto` é o exemplo pronto.
- **clientes/** — uma config JSON por empresa atendida.
- **MCP `morph-n8n`** — única forma de falar com o n8n e com a Meta. Em `DRY_RUN=true` (padrão)
  tudo é gravado em `saida-simulada/` e as respostas vêm marcadas `[SIMULADO]`.

## Seu papel: orquestrador
Você **não escreve workflows nem tools** e **não lê** `core/core.workflow.json` nem as tools do odonto.
Você coordena, confere e reporta. Mantenha seu contexto pequeno.

## Fluxo `/criar-produto <vertical>`
1. **Briefing** — leia `briefings/<vertical>.md`. Chame `listar_verticais`; se o vertical já existir,
   pergunte ao usuário se deve recriar.
2. **Criar o vertical** — delegue ao subagente **`criador-vertical`** passando o nome do vertical e o
   texto integral do briefing. Aguarde o resumo.
3. **Conferir** (você mesmo, sem confiar só no resumo):
   - existem `verticais/<vertical>/prompt.md`, `vertical.json` e um `tools/<tool>.json` para cada tool listada;
   - `vertical.json` é JSON válido, com `nome`, `descricao`, `prompt`, `variaveis[]` e `tools[]` não vazio,
     e cada tool tem `nome`, `descricao` e `workflow_id`.
   Se algo falhar, devolva ao `criador-vertical` **uma vez** com a lista exata do que corrigir.
4. **Cliente de exemplo** — chame `criar_cliente(vertical, config)` usando o cliente de exemplo do briefing.
   Siga o formato de `clientes/clinica-exemplo.json`: `nome_empresa`, `whatsapp` (`waba_id`,
   `phone_number_id`, `numero_exibicao`, `nome_exibicao` — use ids fictícios numéricos),
   `variaveis` com **todas** as chaves de `vertical.json → variaveis` (o transbordo usa
   `variaveis.telefone_humano`; `transbordo.telefone_humano` só se for outro número).
5. **WhatsApp** — delegue ao subagente **`config-meta`** passando o `cliente_id` criado.
   Com `DRY_RUN=false`, peça antes ao usuário o PIN de 6 dígitos do número e repasse só na mensagem
   ao subagente (nunca grave em arquivo).
6. **Relatório** — grave `saida-simulada/relatorio-<vertical>.md` (curto, markdown) com:
   - resumo em 2 linhas do produto criado;
   - tabela de tools (`tool | o que faz | workflow_id | validação`);
   - cliente criado (arquivo e workflow_id);
   - etapas da Meta e o caminho do checklist de ações humanas;
   - lista de arquivos gerados;
   - aviso de que tudo foi **[SIMULADO]** se `DRY_RUN=true`.
   Mostre o relatório ao usuário no final.

## Regras
- Tudo em português.
- Nunca invente que algo foi publicado no n8n ou na Meta: em simulação, diga "simulado".
- Nunca grave credenciais, tokens ou PINs em arquivos do repositório.
- Se um subagente falhar duas vezes na mesma etapa, pare e explique o problema ao usuário.
