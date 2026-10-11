## Resumo
<!-- O que muda e por quê, em 2 a 4 linhas, em pt-BR. -->

## Referências
- **Spec:** [spec-NN — título](docs/sdd/NN-slug.md) · **Nível:** lite/completo · **Risco:** baixo/médio/alto
- **Jira:** CHAVE-123
- **ADR:** nenhum / ADR-NNNN

## Requisitos atendidos
- **RF:** RF-01, RF-02
- **RNF:** RNF-01 (segurança), …

## Critérios de aceite → evidência
| CA | Requisito | Verificação | Evidência |
|---|---|---|---|
| CA-01 | RF-01 | teste | `tests/…::test_ca_01_…` passou |

## Roteiro de validação manual em homologação
<!-- Os CA com verificação "manual". Passo a passo para o revisor após o merge em develop. "Nenhum" se não houver. -->
1. …

## Como foi testado
- [ ] Testes unitários: `…` (N passaram)
- [ ] Build: `…`
- [ ] Smoke (validador): `SMOKE OK (…)`

## Validação
- **Veredito:** APROVADO
- **Validador:** spec-checker (Sonnet low) / spec-validator (Opus high)
- **Achados resolvidos:** …

## Changelog
<!-- Entrada pronta; o release-manager consolida no CHANGELOG.md na release. -->
- **Adicionado:** …

## Atenção no deploy
<!-- Banco recriado, variáveis de ambiente novas, infra, ordem de passos. "Nenhuma" se não houver. -->

## Checklist
- [ ] Base da PR é `develop` (ou `epic/<slug>`), nunca `main`/`master`
- [ ] Só arquivos do Design da spec foram tocados
- [ ] Docs atualizados (README, ARCHITECTURE, INSTRUCTIONS, contratos, ADR)
- [ ] Sem segredo, sem dado pessoal em log, sem dependência não aprovada
- [ ] Commits no padrão `<tipo>(<escopo>): <descrição em pt-BR>`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
