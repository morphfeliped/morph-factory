---
description: Fábrica Morph — cria um produto (vertical + cliente de exemplo + WhatsApp) a partir de briefings/<vertical>.md
argument-hint: <vertical>
---

Rode o **fluxo completo da fábrica** descrito no `CLAUDE.md` para o vertical **`$ARGUMENTS`**,
usando o briefing `briefings/$ARGUMENTS.md`.

Se `$ARGUMENTS` estiver vazio, liste os briefings disponíveis em `briefings/` e pergunte qual usar.
Se o briefing não existir, pare e avise.

Ao final, mostre o relatório salvo em `saida-simulada/relatorio-$ARGUMENTS.md`.
