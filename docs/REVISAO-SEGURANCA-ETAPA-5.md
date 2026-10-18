# Etapa 5 — Revisão final de segurança

Data da revisão: 2026-10-18  
Branch revisada: `revisao-seguranca-main`

## Correções/verificações presentes nesta branch

- Remoção da rota de debug do servidor.
- Helmet habilitado e cabeçalho `X-Powered-By` desativado.
- Limites de tamanho para JSON e tentativas nas rotas de login/cadastro.
- Cookie de sessão `httpOnly`, `sameSite=lax` e `secure` em produção.
- Rotação da sessão após login e persistência da sessão antes da resposta.
- Hash de senha com scrypt para os fluxos já revisados e migração de hashes legados após login válido.
- Verificações de sessão, perfil e identidade nas rotas revisadas de reservas e empréstimos.
- Acesso de Secretaria e consultas de itens de aluno/professor com middleware de autorização.
- Testes estruturais automatizados e workflow de verificação adicionados nesta etapa.

## Bloqueadores que impedem declarar produção segura

1. **Sessões em produção:** `express-session` está sem `store` configurado, portanto usa MemoryStore. É necessário escolher e configurar um armazenamento de sessão persistente compatível com a hospedagem antes de produção.
2. **Testes funcionais:** os testes adicionados verificam estrutura e sintaxe; não substituem testes de login/roles com servidor executando, cookies, planilha Google e usuários de teste.
3. **Google Sheets:** nenhuma operação real foi feita na planilha. Confirmar permissões da conta de serviço, nomes/colunas das abas e comportamento com dados de teste.
4. **Configuração de deploy:** confirmar `FRONTEND_ORIGIN`, `SESSION_SECRET`, `SPREADSHEET_ID` e credenciais no painel de hospedagem. Nunca gravar valores secretos no repositório.
5. **Autorização completa:** revisar cada endpoint de escrita de Secretaria/ADM e testar tentativas de acesso cruzado entre perfis, especialmente alterações de status, reservas, empréstimos e operações de estoque.
6. **Senhas existentes:** confirmar que o layout da aba `01_USUARIOS` usa D=SenhaHash e E=Salt e validar a migração com uma cópia de teste da planilha antes de depender dela em produção.

## Resultado

A revisão de código e as verificações automatizadas são uma etapa de preparação, não uma certificação de segurança. Não liberar para produção nem mesclar em `main` até os bloqueadores acima serem resolvidos e os testes passarem.
