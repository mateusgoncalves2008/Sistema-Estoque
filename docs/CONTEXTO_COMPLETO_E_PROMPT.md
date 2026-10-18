# CONTEXTO COMPLETO DO PROJETO — SISTEMA DE ESTOQUE ESCOLAR

> Documento de passagem de contexto para outro chat/assistente. Leia este arquivo antes de alterar o código. Ele descreve o que foi pedido, a estrutura observada no repositório, as regras de negócio e o ponto atual. Quando houver diferença entre este documento e o código real, inspecione o código da branch indicada e corrija o documento; não assuma que algo funciona só porque está descrito como objetivo.

## 1. Identidade e objetivo

- Projeto: Sistema de Estoque da Escola Estadual Hauy Petruceli Mayrink.
- Repositório: https://github.com/mateusgoncalves2008/Sistema-Estoque
- Pasta local informada pelo usuário: `C:\projetos\Sistema-Estoque`
- Stack observada: Node.js + Express no backend; HTML/CSS/JavaScript no frontend; Google Sheets como banco de dados; integração com Google Sheets API.
- Aplicação com vários perfis de acesso e painéis separados.
- O usuário é iniciante/intermediário em programação e prefere respostas em português brasileiro, informais, diretas e resumidas na conversa normal. Para tarefas de projeto, seja detalhado e organizado. Evite emojis. Ao enviar código, dê instruções concretas e não faça mudanças que não foram solicitadas.

## 2. Regra de trabalho obrigatória

1. Antes de alterar arquivos, leia este documento e inspecione os arquivos atuais da branch.
2. Trabalhe na branch `fix/estoque-responsavel-statuslocal`, salvo se o usuário pedir explicitamente outra branch.
3. Não faça merge em `main`, não publique/deploy, não crie PR e não altere produção sem autorização explícita.
4. Não diga que o código foi testado se não tiver realmente executado testes.
5. Preserve funcionalidades existentes. Faça mudanças pequenas, integradas e coerentes com o padrão atual do projeto.
6. Nunca invente colunas da planilha, IDs, rotas, variáveis de ambiente ou nomes de abas. Leia o código e/ou os cabeçalhos reais antes de depender deles.
7. Não imprima segredos, tokens, senhas, conteúdo de credenciais ou valores de arquivos `.env`. Nunca adicione credenciais ao Git.
8. Após alterar código, verifique sintaxe, imports, nomes de rota, IDs do HTML, eventos do frontend e compatibilidade com o schema real do Sheets.
9. Não duplique funções, listeners, middleware, rotas nem `app.use` sem verificar se já existem.
10. Se houver incerteza sobre o schema da planilha ou comportamento de produção, explique a dúvida e procure confirmação no código existente antes de fazer uma alteração destrutiva.

## 3. Painéis e status do trabalho

O sistema foi planejado com cinco painéis:

### Painel Aluno — considerado concluído pelo usuário
- Aluno acessa o sistema para consultar/reservar itens disponíveis, como livros e computadores da escola para pesquisa.
- Preservar o fluxo e as rotas já existentes. Não refazer o painel sem pedido e sem auditar o código primeiro.
- A existência de arquivos no repositório não substitui um teste funcional.

### Painel Professor — considerado concluído pelo usuário
- Professor usa o sistema para consultar/reservar recursos e itens da escola, inclusive computador para pesquisa.
- O sistema também tem rotas de itens do professor.
- Preservar as funcionalidades já existentes.

### Painel Responsável pelo setor — EM CONSTRUÇÃO
Exemplos de setor: Cantina, Laboratório de Informática, Laboratório de Ciência, Biblioteca.
- O responsável deve enxergar e administrar o estoque apenas do(s) local(is) a que está vinculado.
- A tela tem navegação lateral e seções de visão geral, estoque, movimentações e solicitações, conforme o HTML existente.
- A prioridade recente é cadastrar item e vincular automaticamente o registro às abas `02_PRODUTOS` e `06_ESTOQUE_LOCAIS`; além disso, aumentar/diminuir quantidades e desativar item sem apagar histórico.
- Ações de Entrada/Saída/Desativar já foram introduzidas na branch, mas precisam de teste real.
- O formulário de cadastro foi introduzido no HTML/JS/CSS, mas ainda precisa ser validado end-to-end contra a planilha e o schema real.
- A saída/logout desse painel também foi identificada em conversas anteriores como pendente de ligação à rota de logout. Verifique o código atual antes de afirmar o status.

### Painel ADM — EM CONSTRUÇÃO
Objetivo do usuário: administração ampla (“controle de tudo”), com visibilidade e auditoria sobre operações relevantes, sem contornar permissões de segurança.
Funcionalidades planejadas:
- visualizar e administrar alunos, professores, responsáveis, secretaria, cadastros, setores, itens, estoque e movimentações;
- gerenciar vínculos dos responsáveis a setores;
- consultar estoque e alertas/itens abaixo do mínimo;
- editar cadastros e corrigir dados com registro de auditoria;
- adicionar/remover setores e itens respeitando referências e histórico;
- visualizar logs e identificar falhas/ações incomuns;
- gerar IDs automaticamente.
Não assumir que todos esses recursos já existem; conferir arquivos em `frontend/adm` e rotas de backend antes de implementar.

### Painel Secretaria — EM CONSTRUÇÃO
Existe rota de backend `backend/routes/secretaria.js` e pasta `frontend/secretaria`. O escopo deve ser confirmado pelo código. Não dizer que está concluído.

**Resumo de status declarado pelo usuário:** Aluno e Professor concluídos; Responsável, ADM e Secretaria ainda estão sendo montados.

## 4. Estrutura observada do repositório

A estrutura exata pode evoluir; confirme no GitHub antes de usar caminhos não listados.

```
Sistema-Estoque/
├── index.html                    # Página/entrada do site na raiz
├── index.js                      # Arquivo pequeno na raiz; inspecionar antes de alterar
├── package.json                  # Scripts/dependências do projeto
├── package-lock.json
├── backend/
│   ├── server.js                 # Inicialização do Express, middleware e montagem de rotas
│   ├── database/
│   │   └── googleSheets.js       # Cliente/acesso ao Google Sheets (confirmar arquivo atual)
│   ├── routes/
│   │   ├── auth.js               # Autenticação
│   │   ├── cadastro.js           # Cadastro
│   │   ├── debug.js              # Rotas auxiliares/testes; proteger em produção
│   │   ├── bloqueios-denuncias.js
│   │   ├── emprestimos.js
│   │   ├── produtos.js
│   │   ├── professorItens.js
│   │   ├── reservas.js
│   │   ├── responsavel.js        # Painel Responsável
│   │   └── secretaria.js         # Painel Secretaria
│   └── services/                 # Serviços compartilhados; conferir conteúdo atual
└── frontend/
    ├── img/                      # Imagens/ativos
    ├── login/                    # Tela de login
    ├── aluno/                    # Painel Aluno
    ├── professor/                # Painel Professor
    ├── responsavel/              # Painel Responsável
    │   ├── index.html
    │   ├── script.js
    │   └── style.css
    ├── adm/                      # Painel ADM
    └── secretaria/               # Painel Secretaria
```

O frontend usa arquivos estáticos por perfil. O backend monta endpoints com prefixo `/api` (verifique a configuração exata em `backend/server.js`). No painel Responsável, o JS usa `const API_BASE = "/api"`.

## 5. Design e identidade visual

### Painel Responsável
Paleta observada em `frontend/responsavel/style.css`:
- Marrom escuro: `#352219`
- Terracota/laranja: `#c95730`
- Bege: `#f4eee7`
- Branco quente: `#fffdfa`
- Texto: `#3c291f`
- Texto secundário: `#8a786b`
- Borda: `#e6d8cc`
- Fundo: `#f8f5f1`
- Verde: `#23845b`
- Azul: `#3977b9`
- Roxo: `#7d62b4`
- Vermelho de alerta: `#bd4a42`
- Tipografia: Inter; ícones Font Awesome 6.5.2 incluídos no HTML do painel Responsável.

Há também uma paleta histórica usada em telas anteriores/registro:
- Terracota `#A85F43`, terracota escuro `#8E4D36`, marrom `#493126`, creme `#F4EEE5`, verde `#557A3E`, verde-lima `#A6B83F`, branco, cinza e vermelho de erro.
Não misture paletas aleatoriamente: respeite o CSS do painel que está sendo editado e os tokens existentes nele.

Preferências visuais do usuário:
- Interface organizada, limpa, moderna, com espaço e hierarquia visual.
- Usar as cores da escola e ícones consistentes; não usar emojis como ícones.
- Evitar cards/quadrados decorativos sem função, especialmente o “quadrado no topo” que o usuário não gostou.
- Tabelas e gráficos devem aproveitar a tela sem cortar títulos, sem ficarem apertados.
- Formularios devem ser claros, responsivos e usáveis em celular.
- Manter ações junto dos itens e evitar telas visualmente poluídas.

## 6. Integração com Google Sheets

Google Sheets é a fonte de dados. Não criar um banco paralelo nem simular salvamento no navegador. O backend deve validar e gravar os dados, e o frontend deve mostrar o resultado da API.

Abas conhecidas no projeto:
- `01_USUARIOS` — contas/usuários (um teste de integração existente usa `01_USUARIOS!A1:K5`).
- `02_PRODUTOS` — cadastro de produtos.
- `03_CATEGORIAS` — categorias.
- `04_SUBCATEGORIAS` — subcategorias.
- `05_LOCAIS` — locais/setores.
- `06_ESTOQUE_LOCAIS` — saldo de cada produto por local.
- `07_MOVIMENTACOES` — histórico de entradas/saídas/movimentações (verifique o schema exato no código).
Os nomes e colunas acima são os que o projeto vem usando, mas sempre confira a primeira linha da planilha e os intervalos de leitura/gravação do código antes de concluir que todos os cabeçalhos estão idênticos.

### Aba 02_PRODUTOS — colunas informadas pelo usuário
A `ProdutoID` — automático, não solicitar no formulário.
B `Codigo` — automático; exemplo de padrão `IT-TI-0023` → `IT-TI-0024`. O código deve considerar o prefixo correto do local/setor e o maior sufixo já existente para evitar duplicações.
C `Nome` — obrigatório.
D `Autor` — manter em branco no fluxo de cadastro atual; não exibir no formulário.
E `CategoriaID` — selecionar em dropdown populado pela aba `03_CATEGORIAS`.
F `SubcategoriaID` — dropdown dependente da categoria, populado pela aba `04_SUBCATEGORIAS`.
G `EstoqueMinimo` — inteiro não negativo.
H `Estado` — valores esperados: `NOVO`, `BOM`, `DANIFICADO`, `INCOMPLETO`.
I `Status` — valores esperados: `ATIVO`, `INATIVO`.
J `DataCadastro` — automático.
K `Observacao` — texto opcional.

### Aba 06_ESTOQUE_LOCAIS — colunas informadas pelo usuário
A `EstoqueID` — ID automático e único.
B `ProdutoID` — exatamente o ID do produto criado em `02_PRODUTOS`.
C `LocalID` — ID do local vinculado ao responsável autenticado; não deixar o usuário escolher um local arbitrário.
D `Quantidade` — quantidade total inicial.
E `Reservado` — iniciar em `0`.
F `Disponivel` — para item ativo, inicialmente igual a `Quantidade`; recalcular conforme reservas e devoluções.
G `Indisponivel` — iniciar em `0`, salvo se houver uma regra confirmada de estado que exija outra coisa.
H `UltimaAtualizacao` — preenchida automaticamente.
I `StatusLocal` — status do item naquele local; `ATIVO` ou `INATIVO` conforme a regra confirmada.

**Invariante importante:** para um estoque ativo, a disponibilidade deve ser coerente com quantidade total, reservado e indisponível. A fórmula exata precisa respeitar o significado atual dos campos e as regras das rotas existentes; em geral `Disponivel = Quantidade - Reservado - Indisponivel`, sem permitir valores negativos. Não sobrescrever `Reservado` para zero ao atualizar uma quantidade se já existirem reservas. Toda operação deve respeitar as reservas ativas.

### Regra de cadastro pedida
Quando o responsável cadastra um produto, a ação deve criar os dois registros relacionados:
1. Uma linha em `02_PRODUTOS!A:K`.
2. Uma linha em `06_ESTOQUE_LOCAIS!A:I`, com o ProdutoID recém-gerado e LocalID do setor vinculado.
Os IDs e datas são automáticos. A categoria e subcategoria precisam existir e estar ativas; a subcategoria deve pertencer à categoria escolhida. Quantidade e estoque mínimo devem ser inteiros >= 0. O usuário não deve preencher Autor, IDs ou DataCadastro manualmente.

A gravação dos dois registros deve ser tratada como uma única operação lógica. Se a API do Sheets não oferece transação atômica, pensar em estratégia para evitar produto órfão quando uma das gravações falhar (por exemplo, escrita em lote quando suportada, validação prévia e/ou compensação segura com log). Não remover dados históricos para “corrigir” inconsistências.

### Reserva, entrada, saída e desativação
- Ao reservar uma unidade, atualizar `Reservado` e `Disponivel` de forma coerente. Exemplo do usuário: se havia uma unidade disponível e ela é reservada, Disponivel vai a 0 e Reservado vai a 1.
- Entrada aumenta a quantidade total e a disponibilidade de acordo com a regra do estoque.
- Saída não pode retirar unidade já reservada nem produzir saldo negativo.
- Desativar item no local deve mudar `StatusLocal` para `INATIVO` e impedir novas reservas/uso daquele item naquele setor. Não apagar a linha do produto, a linha do estoque nem o histórico de movimentações.
- Conferir como as rotas de reservas de aluno/professor filtram `StatusLocal`; desativar só funciona globalmente para aquele local se todos os fluxos de leitura e reserva respeitarem o status.
- Não confundir `Status` de `02_PRODUTOS` com `StatusLocal` de `06_ESTOQUE_LOCAIS`: são conceitos distintos.

## 7. Segurança, autenticação e validação

O projeto usa Express, sessões e Google Sheets. `backend/server.js` inclui middleware como Helmet, CORS, JSON, express-session e rate limit (confirme opções e ordem exatas antes de mudar). `backend/routes/auth.js` trata autenticação.

Regras obrigatórias:
- A autorização deve ser validada no backend para cada rota privada. Esconder botão no frontend não é segurança.
- Para o painel Responsável, obter o setor a partir da sessão e do vínculo real na planilha; nunca aceitar `LocalID` enviado pelo navegador como autoridade.
- Validar e normalizar todos os valores recebidos do cliente. Rejeitar status/estado fora da lista permitida, números negativos, frações em campos de quantidade, nomes vazios e IDs inválidos.
- Validar relações categoria/subcategoria e vínculo do responsável/local no servidor.
- Retornar mensagens úteis sem expor stack traces, tokens, detalhes internos ou credenciais.
- Não confiar em `sessionStorage` como mecanismo de autenticação; a sessão no servidor deve ser a autoridade.
- Proteger endpoints de debug e testes para que não exponham dados sensíveis em produção.
- Manter segredos em variáveis de ambiente/Secret Files, nunca em arquivos versionados. O projeto foi configurado anteriormente para usar `SPREADSHEET_ID` e credenciais Google no ambiente do backend; confirmar o mecanismo atual em `backend/database/googleSheets.js` e no deploy.
- Aplicar princípio do menor privilégio. O ADM pode ter acesso amplo dentro do sistema, mas as ações devem ser autorizadas, registradas e auditáveis.
- Usar logs de auditoria para alterações de cadastro, estoque, status, permissões, reservas, entradas/saídas e operações administrativas.
- Evitar SQL-like/string building para ranges com input de usuário; ranges devem ser fixos ou validados.
- Não fazer operações destrutivas em planilha sem confirmar com o usuário e manter histórico.

## 8. Backend, execução e deploy

- `package.json` na raiz define `start: node backend/server.js`, Node >=18 e CommonJS.
- O backend é Express; a integração com Sheets está em `backend/database`.
- O servidor tem rotas de autenticação, cadastro, produtos, reservas, empréstimos, professor, responsável, secretaria e debug.
- Um teste/diagnóstico existente usa `/api/teste-planilha` lendo `01_USUARIOS!A1:K5` e `/api/teste` (confirmar no código antes de usar).
- Informações de deploy citadas anteriormente: Render, serviço `sistema-estoque-ioec`, URL `https://sistema-estoque-ioec.onrender.com`, configuração de build/start previamente descrita como `npm install` e `node server.js` com root `backend`. A configuração pode ter mudado; verifique o painel de deploy e não publique sem autorização.
- Houve anteriormente um problema de divergência de branch: Render estava configurado para `main`, enquanto o desenvolvimento ocorria em uma branch como `Painel-Aluno`. Confirmar a branch conectada ao deploy antes de esperar que mudanças apareçam no site.
- Não presumir que commit em branch de feature aparece no site publicado.

## 9. Estado da branch e últimas mudanças

Branch de trabalho: `fix/estoque-responsavel-statuslocal`
Link: https://github.com/mateusgoncalves2008/Sistema-Estoque/tree/fix/estoque-responsavel-statuslocal

Última implementação trabalhada nesta branch:
- `backend/routes/responsavel.js`: adicionadas rotas de opções de categoria/subcategoria e cadastro de item, além de funções para gerar IDs/códigos. O endpoint de cadastro foi pensado para gravar em `02_PRODUTOS` e `06_ESTOQUE_LOCAIS`.
- `frontend/responsavel/index.html`: botão “Cadastrar item” e formulário/modal com Nome, Categoria, Subcategoria, Quantidade inicial, Estoque mínimo, Estado, Status e Observação.
- `frontend/responsavel/script.js`: carregamento de opções, subcategoria dependente, POST para cadastro, aviso e atualização do painel.
- `frontend/responsavel/style.css`: estilos responsivos do formulário na paleta do painel.

**Atenção: esta mudança ainda não foi executada/testada end-to-end.** O próximo chat deve inspecionar os arquivos atuais da branch e corrigir qualquer erro antes de declarar concluído. Em particular:
1. Confirmar o gerador de código de produto e o prefixo a partir do código real do local. Não presumir que `05_LOCAIS!B` é o prefixo sem verificar os cabeçalhos/dados.
2. Confirmar colunas reais e semântica de `03_CATEGORIAS`, `04_SUBCATEGORIAS` e `05_LOCAIS`. O código atual usa intervalos `03_CATEGORIAS!A:D`, `04_SUBCATEGORIAS!A:E`, `05_LOCAIS!A:G`; verificar se os índices de Status e CategoriaID estão certos.
3. Confirmar que os nomes de variáveis/helpers usados nas rotas (`sheets`, `SPREADSHEET_ID`, `texto`, `normalizar`, `dataAtual`, `carregarVinculo`, `exigirResponsavel`) existem e funcionam no arquivo atual.
4. Verificar que a montagem de `router` e o prefixo `/api` produzem as URLs usadas pelo frontend.
5. Verificar se o ID sequencial pode colidir quando linhas foram apagadas ou se há IDs com formatos diferentes. Melhor usar o maior ID válido existente, considerando todas as linhas relevantes.
6. Confirmar a política correta quando `Status=INATIVO`: produto inativo deve começar com `StatusLocal=INATIVO` e `Disponivel=0`, sem apagar o registro.
7. Confirmar o comportamento da função de aviso `showNotice`, da função `openPage` e de `carregarPainel`.
8. A gravação batch pode gravar as duas linhas juntas, mas confirmar como o Google Sheets API responde e que os intervalos de destino são os corretos.
9. Corrigir o bug de operação Entrada/Saída se ainda existir: `normalizar()` transforma valores em maiúsculas; comparação deve usar os mesmos valores normalizados.
10. Rodar ao menos `node --check backend/routes/responsavel.js` e verificar sintaxe do JS frontend, além de testes com dados controlados. Não gravar dados de teste na planilha de produção sem autorização.
11. Verificar se desativação filtra o item em todas as telas de aluno/professor e em todas as rotas de reserva.
12. Verificar logout no painel Responsável, que foi identificado anteriormente como pendente.

Não assuma que a implementação está pronta até esses pontos serem verificados.

## 10. Próximas prioridades sugeridas (não executar automaticamente)

1. Auditar a branch e corrigir sintaxe e erros de integração das mudanças recentes.
2. Conferir o schema real de todas as abas usadas pelo cadastro.
3. Testar cadastro com quantidade zero e com quantidade maior que zero, verificando ambas as abas.
4. Testar subcategoria de categoria errada, IDs inválidos, números negativos e status inválido.
5. Testar Entrada, Saída, reserva, devolução e desativação com reservas pendentes.
6. Garantir que os painéis Aluno e Professor não mostrem nem aceitem reserva de item com `StatusLocal=INATIVO`.
7. Finalizar logout e mensagens de erro do painel Responsável.
8. Documentar rotas, planilha e papéis em arquivos separados quando o schema tiver sido confirmado.
9. Continuar os painéis ADM e Secretaria sem prejudicar os painéis que o usuário considera concluídos.

## 11. PROMPT COMPLETO PARA COPIAR EM OUTRO CHAT

Você está continuando o projeto real do usuário, não criando um projeto novo. Primeiro leia `docs/CONTEXTO_COMPLETO_E_PROMPT.md` e inspecione o repositório https://github.com/mateusgoncalves2008/Sistema-Estoque na branch `fix/estoque-responsavel-statuslocal`.

Seu objetivo é compreender a arquitetura atual e continuar de onde paramos sem perder contexto. O sistema é para a Escola Estadual Hauy Petruceli Mayrink, feito com Node.js/Express, frontend HTML/CSS/JavaScript e Google Sheets como banco. A pasta local informada é `C:\projetos\Sistema-Estoque`.

Os cinco painéis são Aluno, Professor, Responsável pelo setor, ADM e Secretaria. O usuário considera Aluno e Professor concluídos. Responsável, ADM e Secretaria ainda estão em desenvolvimento. Não refaça os dois primeiros sem necessidade. O painel Responsável é a prioridade atual.

Design do painel Responsável: Inter, Font Awesome 6.5.2, marrom `#352219`, terracota `#c95730`, bege `#f4eee7`, branco quente `#fffdfa`, texto `#3c291f`, cinza `#8a786b`, borda `#e6d8cc`, fundo `#f8f5f1`, verde `#23845b`, azul `#3977b9`, roxo `#7d62b4`, vermelho `#bd4a42`. A interface deve ser limpa, espaçosa, responsiva, sem emojis como ícones e sem cards decorativos sem função.

O Google Sheets é a fonte oficial. Abas conhecidas: `01_USUARIOS`, `02_PRODUTOS`, `03_CATEGORIAS`, `04_SUBCATEGORIAS`, `05_LOCAIS`, `06_ESTOQUE_LOCAIS`, `07_MOVIMENTACOES`. Sempre confira os cabeçalhos reais antes de depender dos índices.

Cadastro em `02_PRODUTOS`:
A ProdutoID automático; B Codigo automático sequencial com prefixo do setor (exemplo IT-TI-0023 → IT-TI-0024); C Nome obrigatório; D Autor vazio; E CategoriaID dropdown de 03_CATEGORIAS; F SubcategoriaID dropdown dependente de E, usando 04_SUBCATEGORIAS; G EstoqueMinimo inteiro >=0; H Estado em NOVO/BOM/DANIFICADO/INCOMPLETO; I Status em ATIVO/INATIVO; J DataCadastro automática; K Observacao opcional.

Ao cadastrar, também criar registro em `06_ESTOQUE_LOCAIS`:
A EstoqueID automático; B ProdutoID gerado em 02_PRODUTOS; C LocalID do vínculo real do responsável autenticado; D Quantidade inicial; E Reservado=0; F Disponivel inicialmente igual à Quantidade se ativo; G Indisponivel=0; H UltimaAtualizacao automática; I StatusLocal ATIVO/INATIVO. Não aceitar LocalID arbitrário do navegador. Disponibilidade deve ser atualizada de forma coerente com quantidade, reservas e indisponibilidade, sem saldo negativo. Reservas ativas nunca podem ser apagadas ou ignoradas ao atualizar estoque.

Desativar deve preservar produto, estoque e histórico; apenas marcar `StatusLocal=INATIVO` para aquele local e bloquear novas reservas daquele item no setor. Verifique os fluxos de Aluno/Professor para garantir que eles também respeitem o status local.

Segurança: autorização no backend, sessão no servidor como autoridade, validação de todos os inputs, categoria/subcategoria coerentes e ativas, quantidades inteiras não negativas, status allowlist, nenhuma credencial no Git, nenhuma mensagem de erro com segredos, rotas debug protegidas, logs de auditoria para ações administrativas. O painel ADM terá controle amplo, mas todas as ações devem ser autorizadas e auditáveis.

Estado atual: na branch `fix/estoque-responsavel-statuslocal` foram alterados `backend/routes/responsavel.js`, `frontend/responsavel/index.html`, `frontend/responsavel/script.js` e `frontend/responsavel/style.css` para adicionar botão/formulário de cadastro e endpoints de categoria/subcategoria e cadastro, pretendendo salvar nas duas abas. Essa mudança ainda NÃO foi testada end-to-end e deve ser auditada antes de ser considerada pronta. Confira sintaxe, helpers, nomes de abas/colunas, prefixo do código, URLs API e lógica de estoque. Também verificar bug de Entrada/Saída por diferença de maiúsculas/minúsculas, logout do Responsável e bloqueio de reserva em item desativado.

Trabalhe na branch de feature, não faça merge em main nem deploy sem autorização. Faça primeiro auditoria e testes seguros; depois corrija os problemas encontrados e explique objetivamente quais arquivos foram alterados e quais testes realmente passaram. Não invente resultados de testes nem afirme que algo foi concluído sem evidência.
