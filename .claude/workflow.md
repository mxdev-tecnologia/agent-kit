# Workflow do projeto — agent-kit

Config lida pelas skills e scripts globais (`~/.claude/skills`, `~/.claude/scripts`).
Manual do fluxo: `~/.claude/docs/WORKFLOW.md`. Gerado por `/project-setup`; edite à vontade.
Os títulos e as chaves seguem o template global porque os scripts os leem; o conteúdo dos docs do projeto é em inglês.

## Projeto
- **Nome:** agent-kit
- **Repositório:** mxdev-tecnologia/agent-kit (público)
- **Base padrão:** develop
- **Homologação:** develop → pacote de pré-release (`next`) no npm
- **Produção:** main → `@mxdev-tecnologia/agent-kit` no npm
- **Idioma dos docs:** en (arquivos lidos por agentes); commits, PRs e CHANGELOG em pt-BR

## Jira
- **Projeto:** — (não usado)

## Confluence
- **Espaço:** — (não usado)

## Docs (allowlist)
```text
docs/adr/
docs/sdd/
docs/ARCHITECTURE.md
docs/INSTRUCTIONS.md
README.md
AGENTS.md
CLAUDE.md
CONTRIBUTING.md
SECURITY.md
CHANGELOG.md
```

## Manifests de versão
```text
package.json
```

## Setup do worktree
<!-- Definido na spec-01. -->
```bash
pnpm install --frozen-lockfile --silent
```

## Gate
<!-- Rodado pelo runner a cada implementação. -->
```bash
pnpm --silent lint
pnpm --silent typecheck
pnpm --silent test
pnpm --silent build
node dist/cli.js check --self
```

## Smoke
<!-- Funções usadas por ~/.claude/scripts/smoke.sh: instala o kit num projeto de exemplo e confere os arquivos de cada CLI. -->
```bash
smoke_db_up()    { :; }
smoke_db_admin() { cat >/dev/null; }
smoke_app()      { d="$(mktemp -d)"; echo ok >"$d/health"; exec python3 -m http.server "$SMOKE_PORT" --bind 127.0.0.1 --directory "$d"; }
smoke_tests()    { pnpm --silent test:smoke; }
```

## Hotspots
```text
package.json
src/schemas/
src/catalog/collisions.json
```

## Caminhos sensíveis
<!-- Diff que toca estes caminhos escala a validação para o Opus High. -->
```text
.github/workflows/
src/install/
package.json
```

## Checklist do projeto
- Nenhum conteúdo privado, segredo, URL interna ou dado pessoal (o repo é público).
- Skills, agentes, workflows e regras em inglês e sem citar modelos específicos.
- Nenhum nome colide com comandos nativos do Claude Code, do Codex ou do Antigravity.
- Mudança em schema `cortex.*` incompatível exige versão maior.
- Publicação só pelo CI com proveniência do npm.
