# Contrato do Core — Morph

O **core** é o workflow genérico do bot (webhook da Meta → histórico → LLM → resposta → transbordo humano).
Um **vertical** só fornece *prompt* + *tools*. Siga este contrato e o core funciona sem mudanças.

## 1. Estrutura de um vertical
```
verticais/<vertical>/
├─ vertical.json   ← manifesto (gerado por registrar_vertical)
├─ prompt.md       ← prompt de sistema do agente de IA
└─ tools/<tool>.json  ← um subworkflow n8n por tool
```
`vertical.json`: `{ nome, descricao, versao, prompt, variaveis[], tools[{ nome, descricao, arquivo, workflow_id, args }] }`.
O core lê `prompt` e cria um nó **Tool Workflow** por item de `tools` ligado ao Agente IA.
A `descricao` de cada tool é o que o LLM lê para decidir quando chamá-la: escreva *quando usar*.

## 2. Entrada de toda tool
O core chama a tool via **Execute Workflow Trigger** com:
```json
{ "cliente_id": "oficina-exemplo", "telefone": "5511999990000", "args": { "...": "..." } }
```
- `cliente_id`: id do arquivo em `clientes/`. Use-o para buscar a config/sistemas do cliente.
- `telefone`: do usuário final, formato E.164 sem `+`.
- `args`: argumentos que o LLM extraiu da conversa. Declare-os no `jsonExample` do trigger.
  Datas em `YYYY-MM-DD`, horas em `HH:MM`, placas sem traço (`ABC1D23`). Datas relativas
  ("amanhã", "sexta") o LLM resolve com `{{data_hoje}}` antes de chamar a tool.

## 3. Saída de toda tool
O último nó chama-se **`Retorno`** (Code ou Set) e devolve **um** item:
```json
{ "texto": "Frase curta que o agente pode repassar ao usuário.", "dados": { "...": "estruturado" } }
```
- Em erro, **não lance exceção**: devolva `texto` amigável e `dados: { "erro": "codigo_do_erro" }`.
- `texto` em português, sem markdown pesado (é WhatsApp).

## 4. Forma do subworkflow
```
Execute Workflow Trigger → Validar args → Args ok? ─true→ HTTP Request → Retorno
                                                   └false────────────────↗
```
- **`Validar args`** (Code): devolve os campos normalizados **ou** `{ invalido: true, motivo }`.
- **`Args ok?`** (IF, `$json.invalido` *is not true*): obrigatório depois de `Validar args`, para que
  args inválidos nunca cheguem à API. O validador do MCP reprova a ligação direta no HTTP.
- Tool sem args obrigatórios pode pular os dois: `Trigger → HTTP Request → Retorno`.
- Todos os nós conectados a partir do trigger; 3–6 nós. Nomes `Validar args`, `Args ok?` e `Retorno` são fixos.

**API da Morph** — integrações usam `{{ $env.MORPH_API_URL }}/clientes/<cliente_id>/<recurso>`
(a Morph fala com o sistema do cliente). Configure o HTTP com `neverError: true`: a API responde JSON
e, em erro, `{ "erro": "codigo" }` (ex.: `nao_encontrado`). O `Retorno` checa `$json.erro`.
Se a tool precisa de um recurso novo, invente um nome REST simples e liste-o no resumo como pendência.

## 5. Variáveis do prompt
Escritas como `{{nome}}` no `prompt.md`; substituídas pelo nó *Montar prompt* do core.
- **Do core** (sempre disponíveis): `{{data_hoje}}`, `{{nome_contato}}`.
- **Do cliente** (vêm de `clientes/<id>.json` → `variaveis`): `{{nome_empresa}}`, `{{horarios}}`,
  `{{endereco}}`, `{{telefone_humano}}` + as específicas do vertical (ex.: `{{convenios}}`).
Toda variável do cliente usada no prompt vira obrigatória na criação do cliente.

## 6. Transbordo humano
É do core. O prompt só precisa instruir: *"se o usuário pedir um atendente ou você não souber resolver,
responda exatamente `[TRANSBORDO]`"*. O core detecta a marca e avisa `{{telefone_humano}}`.
A marca vem **sozinha** na mensagem (o texto dela não é enviado ao usuário). Se for preciso orientar
antes (ex.: segurança), oriente numa mensagem e use `[TRANSBORDO]` na seguinte.

## 7. Convenções de nomes
| Item | Padrão | Exemplo |
|---|---|---|
| vertical | minúsculas, uma palavra | `oficina` |
| tool | `verbo_substantivo` em snake_case | `consultar_status_os` |
| arquivo da tool | `tools/<tool>.json` | `tools/agendar_revisao.json` |
| workflow da tool no n8n | `morph.<vertical>.<tool>` | `morph.oficina.agendar_revisao` |
| workflow do cliente | `morph.cliente.<cliente_id>` | `morph.cliente.oficina-exemplo` |
| cliente_id | `<vertical>-<slug-da-empresa>` | `oficina-auto-center-exemplo` |
