# PDV Dani Cakes

Sistema de ponto de venda desktop para a confeitaria Dani Cakes. Roda offline, em uma única máquina, com banco de dados local.

## Stack

- [Electron](https://www.electronjs.org/) 29 + [electron-vite](https://electron-vite.org/)
- React 18 + TypeScript
- Tailwind CSS
- SQLite local via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## Funcionalidades

- **PDV**: venda no balcão, com lançamento retroativo (Admin) e cancelamento parcial de itens.
- **Produtos** e **Cardápio**: catálogo com categorias, unidade/pacote.
- **Histórico**: consulta de vendas e cancelamentos.
- **Agenda**: agendamentos com lembrete automático (notificação do sistema) e modelos de mensagem para WhatsApp (`wa.me`, sem integração de API).
- **Financeiro**: despesas, contas a pagar, despesas recorrentes, regime de caixa ou competência.
- **Painel** (Admin): visão consolidada de vendas, financeiro e agenda.
- **Usuários e papéis**: acesso por tela definido por papel; Painel e Lançamento retroativo são exclusivos do papel Admin.
- **Backup**: cópia automática diária do banco (mantém as últimas 15, em `userData/backups`) + exportação manual e restauração pela tela Usuários → Backup (Admin).
- **Auto-update**: verifica, baixa e instala novas versões sozinho via GitHub Releases (veja "Publicando uma atualização").

## Rodando em desenvolvimento

```bash
npm install
npm run dev
```

Abre o app Electron com hot-reload do renderer.

## Gerando o instalador

```bash
npm run dist
```

Builda o app (`electron-vite build`) e empacota com `electron-builder`. O instalador sai em `release/`.

> No Windows, se o empacotamento falhar tentando extrair o `winCodeSign` por falta de permissão de link simbólico, ative o **Modo de Desenvolvedor** em Configurações → Privacidade e segurança → Para desenvolvedores.

## Publicando uma atualização

O app verifica sozinho (ao abrir e a cada 4h) se existe uma release mais nova no GitHub, baixa em segundo plano e oferece "Reiniciar agora"; se ninguém reiniciar, a atualização entra sozinha no próximo fechamento do app. Isso depende do repositório ser público (leitura de releases sem autenticação) e do `version` do `package.json`.

Para lançar uma versão nova:

1. Suba `"version"` no `package.json` (versionamento semântico).
2. Gere um [Personal Access Token](https://github.com/settings/tokens) do GitHub com escopo `repo` (só pra essa publicação, não fica no app).
3. Rode (Bash/Git Bash):
   ```bash
   GH_TOKEN=seu_token_aqui npm run release
   ```
   No PowerShell:
   ```powershell
   $env:GH_TOKEN = "seu_token_aqui"; npm run release
   ```
   Isso builda, empacota e publica o instalador + `latest.yml` como uma GitHub Release automaticamente.

> Sem certificado de assinatura de código: o Windows pode mostrar um aviso do SmartScreen ocasionalmente durante a instalação da atualização — não é um erro do processo, é o app não sendo um publisher reconhecido.

## Estrutura

```
src/
  main/        # processo principal do Electron: banco (database.ts), auth, backup, IPC (index.ts)
  preload/      # bridge de contexto exposta como window.api
  renderer/src/ # app React (pages/, components/, types.ts)
```

O banco fica em `app.getPath('userData')/pdv.db` (fora do repositório). No primeiro uso, um usuário Admin é criado automaticamente (usuário `0001`, senha `102030` — troque assim que possível em Usuários → Minha conta).

## Login padrão

| Usuário | Senha  |
|---------|--------|
| 0001    | 102030 |
