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
