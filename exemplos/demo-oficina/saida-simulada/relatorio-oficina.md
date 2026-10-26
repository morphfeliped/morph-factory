# Relatório — produto "oficina"

> ⚠️ **[SIMULADO]** — `DRY_RUN=true`. Nada foi publicado no n8n nem na Meta; os requests estão em `saida-simulada/`.

Bot de WhatsApp para oficinas mecânicas e auto centers: agenda serviços, informa o status da OS, consulta
peças, registra lembretes de revisão e dá faixa de orçamento, com tom informal e transbordo para humano.

## Tools do vertical
| tool | o que faz | workflow_id | validação |
|---|---|---|---|
| `agendar_servico` | agenda revisão/serviço após confirmar placa, modelo, serviço, data e hora | sim-oficina-agendar-servico-559ff4 | ok (1ª tentativa) |
| `consultar_status_os` | status da ordem de serviço por número da OS ou placa | sim-oficina-consultar-status-os-aec021 | ok (1ª tentativa) |
| `consultar_pecas` | peça em estoque, quantidade aproximada e preço | sim-oficina-consultar-pecas-ea5a7c | ok (1ª tentativa) |
| `registrar_lembrete` | lembrete de revisão por data ou km (disparo em outro workflow) | sim-oficina-registrar-lembrete-e94e5a | ok (1ª tentativa) |
| `estimar_orcamento` | faixa de preço de serviços comuns pelo modelo do carro | sim-oficina-estimar-orcamento-d40c97 | ok (1ª tentativa) |

Variáveis exigidas do cliente: `nome_empresa`, `endereco`, `horarios`, `veiculos_atendidos`, `formas_pagamento`, `telefone_humano`.

## Cliente criado
- **Auto Center Exemplo** → `clientes/oficina-auto-center-exemplo.json`
- Workflow do cliente (core + 5 tools): `sim-cliente-oficina-auto-center-exemplo-199621`

## WhatsApp (Meta)
| etapa | status |
|---|---|
| inscrever app na WABA `000000000000011` | simulado — success |
| registrar número `000000000000012` | simulado — success (PIN de simulação, não gravado) |
| template `boas_vindas_oficina` (MARKETING, pt_BR) | simulado — PENDING |

Checklist de ações humanas: `saida-simulada/meta/checklist-oficina-auto-center-exemplo.md`
(Embedded Signup, verificação do Business Manager, nome de exibição, PIN, aprovação do template, pagamento).

## Pendências para produção
- A API da Morph precisa expor os recursos inventados pelas tools: `agendamentos`, `ordens-servico`,
  `estoque/pecas`, `lembretes`, `orcamentos/estimativa` (em `/clientes/<id>/...`).
- Workflow agendado que dispara os lembretes de revisão.

## Arquivos gerados
- `verticais/oficina/` — `prompt.md`, `vertical.json`, `tools/` (5 arquivos)
- `clientes/oficina-auto-center-exemplo.json`
- `saida-simulada/n8n/` — 6 workflows (5 tools + cliente)
- `saida-simulada/meta/` — 3 requests à Graph API + checklist
