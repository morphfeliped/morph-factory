# Checklist de ações humanas — Auto Center Exemplo (oficina-auto-center-exemplo)

Etapas que nenhum agente consegue fazer. Tudo aqui é pendente até a execução real fora do DRY_RUN.

- [ ] **Cliente** — login no Embedded Signup (Facebook Login for Business) e escolha ou criação da WABA (`000000000000011`).
- [ ] **Cliente** — verificação do Business Manager com os documentos da empresa.
- [ ] **Cliente** — definir o PIN de verificação em duas etapas (6 dígitos) e repassá-lo ao orquestrador só no momento do registro real. O PIN não fica no repositório.
- [ ] **Meta** — aprovação do nome de exibição "Auto Center Exemplo" do número `+55 19 90000-0011`.
- [ ] **Morph** — acompanhar a aprovação do template `boas_vindas_oficina` (categoria MARKETING, status atual PENDING → esperado APPROVED).
- [ ] **Cliente** — cadastrar método de pagamento na WABA (conversas iniciadas pela empresa são cobradas).

Obs.: todas as chamadas à Meta desta execução foram [SIMULADO]. Nada foi publicado na Meta de fato.
