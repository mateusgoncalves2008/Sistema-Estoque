# ESTRUTURA DO REPOSITÓRIO

Repositório: https://github.com/mateusgoncalves2008/Sistema-Estoque
Branch documentada: `fix/estoque-responsavel-statuslocal`

```
Sistema-Estoque/
├── index.html
├── index.js
├── package.json
├── package-lock.json
├── backend/
│   ├── server.js
│   ├── database/
│   │   └── googleSheets.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── bloqueios-denuncias.js
│   │   ├── cadastro.js
│   │   ├── debug.js
│   │   ├── emprestimos.js
│   │   ├── produtos.js
│   │   ├── professorItens.js
│   │   ├── reservas.js
│   │   ├── responsavel.js
│   │   └── secretaria.js
│   └── services/
└── frontend/
    ├── img/
    ├── login/
    ├── aluno/
    ├── professor/
    ├── responsavel/
    │   ├── index.html
    │   ├── script.js
    │   └── style.css
    ├── adm/
    └── secretaria/
```

> Estrutura resumida observada na branch no momento da documentação. Pastas podem conter outros arquivos. Consulte a árvore atual do GitHub para obter a lista exata.

## Responsabilidade dos arquivos principais

- `backend/server.js`: inicializa Express, carrega middleware e registra rotas.
- `backend/database/googleSheets.js`: cliente da API do Google Sheets.
- `backend/routes/auth.js`: autenticação.
- `backend/routes/cadastro.js`: cadastros.
- `backend/routes/produtos.js`: produtos.
- `backend/routes/reservas.js`: reservas.
- `backend/routes/emprestimos.js`: empréstimos.
- `backend/routes/professorItens.js`: itens ligados ao professor.
- `backend/routes/responsavel.js`: API do Painel Responsável, incluindo estoque local e as rotas de cadastro recentes.
- `backend/routes/secretaria.js`: API do Painel Secretaria.
- `frontend/aluno/`: interface do aluno.
- `frontend/professor/`: interface do professor.
- `frontend/responsavel/`: interface do responsável, com HTML, JavaScript e CSS.
- `frontend/adm/`: interface do administrador.
- `frontend/secretaria/`: interface da secretaria.
- `frontend/login/`: login.
- `frontend/img/`: imagens e ativos.

## Fluxo de dados esperado

```
Navegador (painel)
   -> fetch("/api/...")
   -> backend/server.js monta a rota
   -> rota valida sessão, papel e dados
   -> backend/database/googleSheets.js
   -> Google Sheets
   -> resposta JSON
   -> interface atualiza tabela e mostra feedback
```

O frontend nunca deve escrever diretamente na planilha nem confiar apenas em validações do navegador. O backend é responsável pela autorização e persistência.

## Estado da feature Responsável

Branch: `fix/estoque-responsavel-statuslocal`
URL: https://github.com/mateusgoncalves2008/Sistema-Estoque/tree/fix/estoque-responsavel-statuslocal

Arquivos alterados recentemente:
- `backend/routes/responsavel.js`
- `frontend/responsavel/index.html`
- `frontend/responsavel/script.js`
- `frontend/responsavel/style.css`

Implementação adicionada para cadastro de item, mas ainda precisa de auditoria e teste end-to-end. Leia `docs/CONTEXTO_COMPLETO_E_PROMPT.md` para detalhes, schema esperado e checklist de validação.
