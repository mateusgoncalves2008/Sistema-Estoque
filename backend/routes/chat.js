router.post("/chat/conversas/:id/mensagens", exigirUsuarioAtivo, async (req, res) => {
    try {
        const corpo = texto(req.body?.mensagem);
        const responderA = req.body?.responderA ? String(req.body.responderA) : null;
        if (!corpo || corpo.length > MAX_MENSAGEM) throw erro(400, "A mensagem deve ter entre 1 e 2.000 caracteres.");
        const mensagem = await executarTransacao(async (db) => {
            const { conversa, outroID } = await buscarConversaDoUsuario(db, req.params.id, req.chatUser);
            if (await existeBloqueio(db, req.chatUser.id, outroID)) throw erro(404, "Conversa não encontrada.");
            if (conversa.status !== "ACTIVE") {
                throw erro(403, "Esta conversa ainda não foi aceita pelo ADM.");
            }
            if (responderA) {
                const original = await db.query("SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2", [responderA, conversa.id]);
                if (!original.rowCount) throw erro(400, "A mensagem escolhida para responder não existe nesta conversa.");
            }
            const inserida = await inserirMensagem(db, conversa.id, req.chatUser.id, corpo);
            if (responderA) await db.query("UPDATE chat_messages SET reply_to_message_id = $1 WHERE id = $2", [responderA, inserida.id]);
            return inserida;
        });
        return res.status(201).json({ sucesso: true, mensagem });
    } catch (e) {
        return responderErro(res, e, "Não foi possível enviar a mensagem.");
    }
});

// Solicitações pendentes são visíveis somente ao ADM destinatário.
router.get("/chat/solicitacoes", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const resultado = await postgres.pool.query(
            `SELECT r.id, r.conversation_id, r.sender_id, r.requested_at,
                    c.status AS conversation_status
               FROM chat_requests r
               JOIN chat_conversations c ON c.id = r.conversation_id
              WHERE r.admin_id = $1 AND r.status = 'PENDING'
              ORDER BY r.requested_at ASC`,
            [req.chatUser.id],
        );
        const usuarios = await carregarUsuariosAtivos();
        const porID = new Map(usuarios.map((item) => [item.id, item]));
        const solicitacoes = resultado.rows.map((item) => {
            const remetente = porID.get(item.sender_id);
            return {
                id: item.id,
                conversaID: item.conversation_id,
                solicitante: remetente ? { id: remetente.id, nome: remetente.nome, tipoUsuario: remetente.tipoUsuario, perfil: remetente.perfil } : { id: item.sender_id, nome: "Usuário" },
                solicitadaEm: item.requested_at,
            };
        });
        return res.json({ sucesso: true, solicitacoes });
    } catch (e) {
        return responderErro(res, e, "Não foi possível carregar as solicitações.");
    }
});

router.patch("/chat/solicitacoes/:id", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const acao = normalizar(req.body?.acao);
        if (!["ACEITAR", "RECUSAR"].includes(acao)) throw erro(400, "Ação inválida. Escolha aceitar ou recusar.");
        const resultado = await executarTransacao(async (db) => {
            const solicitacao = await db.query(
                `SELECT id, conversation_id, sender_id, admin_id, status
                   FROM chat_requests
                  WHERE id = $1 AND admin_id = $2
                  FOR UPDATE`,
                [req.params.id, req.chatUser.id],
            );
            const item = solicitacao.rows[0];
            if (!item || item.status !== "PENDING") throw erro(404, "Solicitação não encontrada ou já respondida.");
            const novoStatus = acao === "ACEITAR" ? "ACCEPTED" : "REJECTED";
            await db.query(
                "UPDATE chat_requests SET status = $1, responded_at = NOW() WHERE id = $2",
                [novoStatus, item.id],
            );
            const statusConversa = acao === "ACEITAR" ? "ACTIVE" : "REJECTED";
            await db.query(
                `UPDATE chat_conversations
                    SET status = $1::VARCHAR,
                        accepted_at = CASE WHEN $1::VARCHAR = 'ACTIVE' THEN NOW() ELSE accepted_at END,
                        rejected_at = CASE WHEN $1::VARCHAR = 'REJECTED' THEN NOW() ELSE rejected_at END,
                        updated_at = NOW()
                  WHERE id = $2::UUID`,
                [statusConversa, item.conversation_id],
            );
            return { conversaID: item.conversation_id, status: novoStatus };
        });
        return res.json({
            sucesso: true,
            ...resultado,
            mensagem: acao === "ACEITAR" ? "Solicitação aceita. A conversa está liberada." : "Solicitação recusada. O usuário poderá tentar novamente no futuro.",
        });
    } catch (e) {
        return responderErro(res, e, "Não foi possível responder à solicitação.");
    }
});

// Bloqueios permanentes administrados pelo ADM. O histórico continua acessível ao ADM.
router.get("/chat/bloqueios", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const resultado = await postgres.pool.query(
            `SELECT blocker_id, blocked_id, created_at
               FROM chat_blocks
              WHERE blocker_id = $1
              ORDER BY created_at DESC`,
            [req.chatUser.id],
        );
        const usuarios = await carregarUsuariosAtivos();
        const porID = new Map(usuarios.map((item) => [item.id, item]));
        const bloqueios = resultado.rows.map((item) => {
            const bloqueado = porID.get(item.blocked_id);
            return {
                usuarioID: item.blocked_id,
                nome: bloqueado?.nome || "Usuário",
                bloqueadoEm: item.created_at,
            };
        });
        return res.json({ sucesso: true, bloqueios });
    } catch (e) {
        return responderErro(res, e, "Não foi possível carregar os bloqueios.");
    }
});

router.post("/chat/bloqueios", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const usuarioID = texto(req.body?.usuarioID);
        if (!usuarioID || usuarioID === req.chatUser.id) throw erro(400, "Informe um usuário válido para bloquear.");
        const usuarios = await carregarUsuariosAtivos();
        if (!usuarios.some((item) => item.id === usuarioID)) throw erro(404, "Usuário não encontrado ou inativo.");
        await executarTransacao(async (db) => {
            await db.query(
                `INSERT INTO chat_blocks (blocker_id, blocked_id)
                 VALUES ($1, $2)
                 ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
                [req.chatUser.id, usuarioID],
            );
            await db.query(
                `UPDATE chat_requests
                    SET status = 'REJECTED', responded_at = NOW()
                  WHERE admin_id = $1
                    AND sender_id = $2
                    AND status = 'PENDING'`,
                [req.chatUser.id, usuarioID],
            );
            await db.query(
                `UPDATE chat_conversations
                    SET status = 'REJECTED', rejected_at = NOW(), updated_at = NOW()
                  WHERE participant_one_id = $1
                    AND participant_two_id = $2
                    AND status = 'PENDING'`,
                [usuarioID, req.chatUser.id],
            );
        });
        return res.status(201).json({ sucesso: true, mensagem: "Usuário bloqueado no chat." });
    } catch (e) {
        return responderErro(res, e, "Não foi possível bloquear o usuário.");
    }
});

router.patch("/chat/conversas/:id/silenciar", exigirUsuarioAtivo, async (req, res) => {
    try {
        if (typeof req.body?.silenciado !== "boolean") throw erro(400, "Informe se as notificações devem ficar silenciadas.");
        await executarTransacao(async (db) => {
            const { conversa } = await buscarConversaDoUsuario(db, req.params.id, req.chatUser);
            await db.query(
                `INSERT INTO chat_conversation_preferences
                    (conversation_id, user_id, notifications_muted, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (conversation_id, user_id)
                 DO UPDATE SET notifications_muted = EXCLUDED.notifications_muted,
                               updated_at = NOW()`,
                [conversa.id, req.chatUser.id, req.body.silenciado],
            );
        });
        return res.json({ sucesso: true, silenciado: req.body.silenciado });
    } catch (e) {
        return responderErro(res, e, "Não foi possível atualizar as notificações da conversa.");
    }
});

// Presença persistida no PostgreSQL para funcionar mesmo com reinícios ou mais de um processo.
router.post("/chat/presenca", exigirUsuarioAtivo, async (req, res) => {
    try {
        await garantirTabelaPresenca();
        await postgres.pool.query(
            `INSERT INTO chat_presence (user_id, last_seen_at)
             VALUES ($1, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET last_seen_at = NOW()`,
            [req.chatUser.id],
        );
        return res.json({ sucesso: true });
    } catch (e) {
        return responderErro(res, e, "Não foi possível atualizar sua presença.");
    }
});
router.get("/chat/presenca", exigirUsuarioAtivo, async (req, res) => {
    try {
        await garantirTabelaPresenca();
        const resultado = await postgres.pool.query(
            `SELECT user_id FROM chat_presence
              WHERE last_seen_at > NOW() - INTERVAL '3 seconds'
                AND user_id <> $1`,
            [req.chatUser.id],
        );
        return res.json({ sucesso: true, online: resultado.rows.map((item) => item.user_id) });
    } catch (e) {
        return responderErro(res, e, "Não foi possível consultar a presença dos usuários.");
    }
});

// Estado temporário de digitação. Expira automaticamente após 5 segundos.
router.post("/chat/conversas/:id/digitando", exigirUsuarioAtivo, async (req, res) => {
    try {
        const { conversa, outroID } = await buscarConversaDoUsuario(postgres.pool, req.params.id, req.chatUser);
        if (conversa.status !== "ACTIVE" || await existeBloqueio(postgres.pool, req.chatUser.id, outroID)) {
            throw erro(404, "Conversa não encontrada.");
        }
        const ativo = req.body?.ativo === true;
        const agora = Date.now();
        const atuais = (digitandoPorConversa.get(conversa.id) || []).filter((item) => item.expiraEm > agora && item.usuarioID !== req.chatUser.id);
        if (ativo) atuais.push({ usuarioID: req.chatUser.id, nome: req.chatUser.nome, expiraEm: agora + 5000 });
        if (atuais.length) digitandoPorConversa.set(conversa.id, atuais);
        else digitandoPorConversa.delete(conversa.id);
        return res.json({ sucesso: true });
    } catch (e) {
        return responderErro(res, e, "Não foi possível atualizar o indicador de digitação.");
    }
});

router.get("/chat/conversas/:id/digitando", exigirUsuarioAtivo, async (req, res) => {
    try {
        const { conversa, outroID } = await buscarConversaDoUsuario(postgres.pool, req.params.id, req.chatUser);
        if (await existeBloqueio(postgres.pool, req.chatUser.id, outroID)) throw erro(404, "Conversa não encontrada.");
        const agora = Date.now();
        const atuais = (digitandoPorConversa.get(conversa.id) || []).filter((item) => item.expiraEm > agora && item.usuarioID !== req.chatUser.id);
        if (atuais.length) digitandoPorConversa.set(conversa.id, atuais);
        else digitandoPorConversa.delete(conversa.id);
        return res.json({ sucesso: true, digitando: atuais.length > 0, nome: atuais[0]?.nome || "" });
    } catch (e) {
        return responderErro(res, e, "Não foi possível consultar quem está digitando.");
    }
});

module.exports = router;ultado = await executarTransacao(async (db) => {
            if (await existeBloqueio(db, req.chatUser.id, destinatarioID)) {
                throw erro(404, "Usuário não encontrado.");
            }

            const configuracao = await obterConfiguracao(db);
            const solicitacaoADM = !isAdm(req.chatUser) &&
                isAdm(destinatario) &&
                Boolean(configuracao.adm_restricted_mode);

            const par = await db.query(
                `SELECT id, status, conversation_type
                   FROM chat_conversations
                  WHERE LEAST(participant_one_id, participant_two_id) = LEAST($1, $2)
                    AND GREATEST(participant_one_id, participant_two_id) = GREATEST($1, $2)
                    AND status IN ('PENDING', 'ACTIVE')
                  LIMIT 1
                  FOR UPDATE`,
                [req.chatUser.id, destinatarioID],
            );

            if (par.rows[0]) {
                const existente = par.rows[0];
                if (existente.status === "PENDING") {
                    throw erro(409, "Sua solicitação já foi enviada. Aguarde a resposta do ADM.");
                }
                const mensagem = await inserirMensagem(db, existente.id, req.chatUser.id, corpo);
                return { conversaID: existente.id, status: existente.status, tipo: existente.conversation_type, mensagem, solicitacao: false };
            }

            const status = solicitacaoADM ? "PENDING" : "ACTIVE";
            const tipo = solicitacaoADM ? "ADM_REQUEST" : "DIRECT";
            const criada = await db.query(
                `INSERT INTO chat_conversations
                    (participant_one_id, participant_two_id, created_by, conversation_type, status)
                 VALUES ($1, $2, $1, $3, $4)
                 RETURNING id, status, conversation_type`,
                [req.chatUser.id, destinatarioID, tipo, status],
            );
            const conversa = criada.rows[0];
            const mensagem = await inserirMensagem(db, conversa.id, req.chatUser.id, corpo);
            if (solicitacaoADM) {
                await db.query(
                    `INSERT INTO chat_requests (conversation_id, sender_id, admin_id, status)
                     VALUES ($1, $2, $3, 'PENDING')`,
                    [conversa.id, req.chatUser.id, destinatarioID],
                );
            }
            return { conversaID: conversa.id, status: conversa.status, tipo: conversa.conversation_type, mensagem, solicitacao: solicitacaoADM };
        });

        return res.status(201).json({
            sucesso: true,
            conversaID: resultado.conversaID,
            status: resultado.status,
            tipo: resultado.tipo,
            solicitacao: resultado.solicitacao,
            mensagem: resultado.solicitacao
                ? "Solicitação enviada ao ADM. Você poderá enviar novas mensagens depois que ela for aceita."
                : "Mensagem enviada.",
        });
    } catch (e) {
        return responderErro(res, e, "Não foi possível iniciar a conversa.");
    }
});

// Lista conversas do usuário. O bloqueado não recebe conversas antigas com o ADM que o bloqueou.
router.get("/chat/conversas", exigirUsuarioAtivo, async (req, res) => {
    try {
        const resultado = await postgres.pool.query(
            `SELECT c.id, c.participant_one_id, c.participant_two_id,
                    c.conversation_type, c.status, c.created_at, c.updated_at,
                    c.last_message_at, c.accepted_at,
                    (SELECT COUNT(DISTINCT m.sender_id)::int FROM chat_messages m WHERE m.conversation_id = c.id) AS remetentes,
                    (SELECT m.body FROM chat_messages m
                      WHERE m.conversation_id = c.id
                      ORDER BY m.id DESC LIMIT 1) AS ultima_mensagem,
                    (SELECT COUNT(*)::int FROM chat_messages m
                      WHERE m.conversation_id = c.id
                        AND m.sender_id <> $1 AND m.read_at IS NULL) AS nao_lidas,
                    (SELECT p.notifications_muted FROM chat_conversation_preferences p
                      WHERE p.conversation_id = c.id AND p.user_id = $1) AS silenciado
               FROM chat_conversations c
              WHERE (c.participant_one_id = $1 OR c.participant_two_id = $1)
              ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC`,
            [req.chatUser.id],
        );
        const bloqueios = await postgres.pool.query(
            "SELECT blocker_id, blocked_id FROM chat_blocks",
        );
        const bloqueados = new Set(bloqueios.rows.map((item) => `${item.blocker_id}|${item.blocked_id}`));
        const usuarios = await carregarUsuariosAtivos();
        const porID = new Map(usuarios.map((item) => [item.id, item]));
        const conversas = resultado.rows
            .filter((item) => {
                const outroID = item.participant_one_id === req.chatUser.id ? item.participant_two_id : item.participant_one_id;
                if (isAdm(req.chatUser)) return true;
                return !bloqueados.has(`${outroID}|${req.chatUser.id}`) &&
                    !bloqueados.has(`${req.chatUser.id}|${outroID}`);
            })
            .map((item) => {
                const outroID = item.participant_one_id === req.chatUser.id ? item.participant_two_id : item.participant_one_id;
                const outro = porID.get(outroID);
                return {
                    id: item.id,
                    status: item.status,
                    estabelecida: Boolean(item.accepted_at) || Number(item.remetentes) >= 2,
                    tipo: item.conversation_type,
                    criadoEm: item.created_at,
                    atualizadoEm: item.updated_at,
                    ultimaMensagemEm: item.last_message_at,
                    ultimaMensagem: item.ultima_mensagem || "",
                    naoLidas: item.nao_lidas,
                    silenciado: Boolean(item.silenciado),
                    contato: outro ? { id: outro.id, nome: outro.nome, tipoUsuario: outro.tipoUsuario, perfil: outro.perfil } : { id: outroID, nome: "Usuário" },
                };
            });
        return res.json({ sucesso: true, conversas });
    } catch (e) {
        return responderErro(res, e, "Não foi possível carregar as conversas.");
    }
});

// Mensagens são retornadas somente aos participantes. A leitura é registrada no servidor.
router.get("/chat/conversas/:id/mensagens", exigirUsuarioAtivo, async (req, res) => {
    try {
        const dados = await executarTransacao(async (db) => {
            const { conversa } = await buscarConversaDoUsuario(db, req.params.id, req.chatUser);
            const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 50, 1), 100);
            const antesID = Number.parseInt(req.query.antes, 10);
            const parametros = [conversa.id];
            let filtro = "";
            if (Number.isSafeInteger(antesID) && antesID > 0) {
                parametros.push(antesID);
                filtro = "AND id < $2";
            }
            const mensagens = await db.query(
                `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, m.read_at,
                        m.reply_to_message_id, original.body AS reply_body, original.sender_id AS reply_sender_id,
                        COALESCE((SELECT json_agg(json_build_object('emoji', r.emoji, 'total', r.total))
                          FROM (SELECT emoji, COUNT(*)::int AS total
                                  FROM chat_message_reactions WHERE message_id = m.id GROUP BY emoji) r), '[]'::json) AS reactions
                   FROM chat_messages m
                   LEFT JOIN chat_messages original ON original.id = m.reply_to_message_id
                  WHERE m.conversation_id = $1 ${filtro}
                  ORDER BY m.id DESC
                  LIMIT ${limite}`,
                parametros,
            );
            const idsLidas = mensagens.rows
                .filter((item) => item.sender_id !== req.chatUser.id && !item.read_at)
                .map((item) => item.id);
            if (idsLidas.length) {
                await db.query(
                    `UPDATE chat_messages
                        SET read_at = NOW()
                      WHERE conversation_id = $1
                        AND sender_id <> $2
                        AND id = ANY($3::bigint[])
                        AND read_at IS NULL`,
                    [conversa.id, req.chatUser.id, idsLidas],
                );
            }
            return mensagens.rows.reverse();
        });
        return res.json({ sucesso: true, mensagens: dados });
    } catch (e) {
        return responderErro(res, e, "Não foi possível carregar as mensagens.");
    }
});

router.post("/chat/conversas/:id/mensagens", exigirUsuarioAtivo, async (req, res) => {
    try {
        const corpo = texto(req.body?.mensagem);
        const responderA = req.body?.responderA ? String(req.body.responderA) : null;
        if (!corpo || corpo.length > MAX_MENSAGEM) throw erro(400, "A mensagem deve ter entre 1 e 2.000 caracteres.");
        const mensagem = await executarTransacao(async (db) => {
            const { conversa, outroID } = await buscarConversaDoUsuario(db, req.params.id, req.chatUser);
            if (await existeBloqueio(db, req.chatUser.id, outroID)) throw erro(404, "Conversa não encontrada.");
            if (conversa.status !== "ACTIVE") {
                throw erro(403, "Esta conversa ainda não foi aceita pelo ADM.");
            }
            if (responderA) {
                const original = await db.query("SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2", [responderA, conversa.id]);
                if (!original.rowCount) throw erro(400, "A mensagem escolhida para responder não existe nesta conversa.");
            }
            const inserida = await inserirMensagem(db, conversa.id, req.chatUser.id, corpo);
            if (responderA) await db.query("UPDATE chat_messages SET reply_to_message_id = $1 WHERE id = $2", [responderA, inserida.id]);
            return inserida;
        });
        return res.status(201).json({ sucesso: true, mensagem });
    } catch (e) {
        return responderErro(res, e, "Não foi possível enviar a mensagem.");
    }
});

// Solicitações pendentes são visíveis somente ao ADM destinatário.
router.get("/chat/solicitacoes", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const resultado = await postgres.pool.query(
            `SELECT r.id, r.conversation_id, r.sender_id, r.requested_at,
                    c.status AS conversation_status
               FROM chat_requests r
               JOIN chat_conversations c ON c.id = r.conversation_id
              WHERE r.admin_id = $1 AND r.status = 'PENDING'
              ORDER BY r.requested_at ASC`,
            [req.chatUser.id],
        );
        const usuarios = await carregarUsuariosAtivos();
        const porID = new Map(usuarios.map((item) => [item.id, item]));
        const solicitacoes = resultado.rows.map((item) => {
            const remetente = porID.get(item.sender_id);
            return {
                id: item.id,
                conversaID: item.conversation_id,
                solicitante: remetente ? { id: remetente.id, nome: remetente.nome, tipoUsuario: remetente.tipoUsuario, perfil: remetente.perfil } : { id: item.sender_id, nome: "Usuário" },
                solicitadaEm: item.requested_at,
            };
        });
        return res.json({ sucesso: true, solicitacoes });
    } catch (e) {
        return responderErro(res, e, "Não foi possível carregar as solicitações.");
    }
});

router.patch("/chat/solicitacoes/:id", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const acao = normalizar(req.body?.acao);
        if (!["ACEITAR", "RECUSAR"].includes(acao)) throw erro(400, "Ação inválida. Escolha aceitar ou recusar.");
        const resultado = await executarTransacao(async (db) => {
            const solicitacao = await db.query(
                `SELECT id, conversation_id, sender_id, admin_id, status
                   FROM chat_requests
                  WHERE id = $1 AND admin_id = $2
                  FOR UPDATE`,
                [req.params.id, req.chatUser.id],
            );
            const item = solicitacao.rows[0];
            if (!item || item.status !== "PENDING") throw erro(404, "Solicitação não encontrada ou já respondida.");
            const novoStatus = acao === "ACEITAR" ? "ACCEPTED" : "REJECTED";
            await db.query(
                "UPDATE chat_requests SET status = $1, responded_at = NOW() WHERE id = $2",
                [novoStatus, item.id],
            );
            const statusConversa = acao === "ACEITAR" ? "ACTIVE" : "REJECTED";
            await db.query(
                `UPDATE chat_conversations
                    SET status = $1::VARCHAR,
                        accepted_at = CASE WHEN $1::VARCHAR = 'ACTIVE' THEN NOW() ELSE accepted_at END,
                        rejected_at = CASE WHEN $1::VARCHAR = 'REJECTED' THEN NOW() ELSE rejected_at END,
                        updated_at = NOW()
                  WHERE id = $2::UUID`,
                [statusConversa, item.conversation_id],
            );
            return { conversaID: item.conversation_id, status: novoStatus };
        });
        return res.json({
            sucesso: true,
            ...resultado,
            mensagem: acao === "ACEITAR" ? "Solicitação aceita. A conversa está liberada." : "Solicitação recusada. O usuário poderá tentar novamente no futuro.",
        });
    } catch (e) {
        return responderErro(res, e, "Não foi possível responder à solicitação.");
    }
});

// Bloqueios permanentes administrados pelo ADM. O histórico continua acessível ao ADM.
router.get("/chat/bloqueios", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const resultado = await postgres.pool.query(
            `SELECT blocker_id, blocked_id, created_at
               FROM chat_blocks
              WHERE blocker_id = $1
              ORDER BY created_at DESC`,
            [req.chatUser.id],
        );
        const usuarios = await carregarUsuariosAtivos();
        const porID = new Map(usuarios.map((item) => [item.id, item]));
        const bloqueios = resultado.rows.map((item) => {
            const bloqueado = porID.get(item.blocked_id);
            return {
                usuarioID: item.blocked_id,
                nome: bloqueado?.nome || "Usuário",
                bloqueadoEm: item.created_at,
            };
        });
        return res.json({ sucesso: true, bloqueios });
    } catch (e) {
        return responderErro(res, e, "Não foi possível carregar os bloqueios.");
    }
});

router.post("/chat/bloqueios", exigirUsuarioAtivo, exigirAdm, async (req, res) => {
    try {
        const usuarioID = texto(req.body?.usuarioID);
        if (!usuarioID || usuarioID === req.chatUser.id) throw erro(400, "Informe um usuário válido para bloquear.");
        const usuarios = await carregarUsuariosAtivos();
        if (!usuarios.some((item) => item.id === usuarioID)) throw erro(404, "Usuário não encontrado ou inativo.");
        await executarTransacao(async (db) => {
            await db.query(
                `INSERT INTO chat_blocks (blocker_id, blocked_id)
                 VALUES ($1, $2)
                 ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
                [req.chatUser.id, usuarioID],
            );
            await db.query(
                `UPDATE chat_requests
                    SET status = 'REJECTED', responded_at = NOW()
                  WHERE admin_id = $1
                    AND sender_id = $2
                    AND status = 'PENDING'`,
                [req.chatUser.id, usuarioID],
            );
            await db.query(
                `UPDATE chat_conversations
                    SET status = 'REJECTED', rejected_at = NOW(), updated_at = NOW()
                  WHERE participant_one_id = $1
                    AND participant_two_id = $2
                    AND status = 'PENDING'`,
                [usuarioID, req.chatUser.id],
            );
        });
        return res.status(201).json({ sucesso: true, mensagem: "Usuário bloqueado no chat." });
    } catch (e) {
        return responderErro(res, e, "Não foi possível bloquear o usuário.");
    }
});

router.patch("/chat/conversas/:id/silenciar", exigirUsuarioAtivo, async (req, res) => {
    try {
        if (typeof req.body?.silenciado !== "boolean") throw erro(400, "Informe se as notificações devem ficar silenciadas.");
        await executarTransacao(async (db) => {
            const { conversa } = await buscarConversaDoUsuario(db, req.params.id, req.chatUser);
            await db.query(
                `INSERT INTO chat_conversation_preferences
                    (conversation_id, user_id, notifications_muted, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (conversation_id, user_id)
                 DO UPDATE SET notifications_muted = EXCLUDED.notifications_muted,
                               updated_at = NOW()`,
                [conversa.id, req.chatUser.id, req.body.silenciado],
            );
        });
        return res.json({ sucesso: true, silenciado: req.body.silenciado });
    } catch (e) {
        return responderErro(res, e, "Não foi possível atualizar as notificações da conversa.");
    }
});

// Presença persistida no PostgreSQL para funcionar mesmo com reinícios ou mais de um processo.
router.post("/chat/presenca", exigirUsuarioAtivo, async (req, res) => {
    try {
        await garantirTabelaPresenca();
        await postgres.pool.query(
            `INSERT INTO chat_presence (user_id, last_seen_at)
             VALUES ($1, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET last_seen_at = NOW()`,
            [req.chatUser.id],
        );
        return res.json({ sucesso: true });
    } catch (e) {
        return responderErro(res, e, "Não foi possível atualizar sua presença.");
    }
});
router.get("/chat/presenca", exigirUsuarioAtivo, async (req, res) => {
    try {
        await garantirTabelaPresenca();
        const resultado = await postgres.pool.query(
            `SELECT user_id FROM chat_presence
              WHERE last_seen_at > NOW() - INTERVAL '3 seconds'
                AND user_id <> $1`,
            [req.chatUser.id],
        );
        return res.json({ sucesso: true, online: resultado.rows.map((item) => item.user_id) });
    } catch (e) {
        return responderErro(res, e, "Não foi possível consultar a presença dos usuários.");
    }
});

// Estado temporário de digitação. Expira automaticamente após 5 segundos.
router.post("/chat/conversas/:id/digitando", exigirUsuarioAtivo, async (req, res) => {
    try {
        const { conversa, outroID } = await buscarConversaDoUsuario(postgres.pool, req.params.id, req.chatUser);
        if (conversa.status !== "ACTIVE" || await existeBloqueio(postgres.pool, req.chatUser.id, outroID)) {
            throw erro(404, "Conversa não encontrada.");
        }
        const ativo = req.body?.ativo === true;
        const agora = Date.now();
        const atuais = (digitandoPorConversa.get(conversa.id) || []).filter((item) => item.expiraEm > agora && item.usuarioID !== req.chatUser.id);
        if (ativo) atuais.push({ usuarioID: req.chatUser.id, nome: req.chatUser.nome, expiraEm: agora + 5000 });
        if (atuais.length) digitandoPorConversa.set(conversa.id, atuais);
        else digitandoPorConversa.delete(conversa.id);
        return res.json({ sucesso: true });
    } catch (e) {
        return responderErro(res, e, "Não foi possível atualizar o indicador de digitação.");
    }
});

router.get("/chat/conversas/:id/digitando", exigirUsuarioAtivo, async (req, res) => {
    try {
        const { conversa, outroID } = await buscarConversaDoUsuario(postgres.pool, req.params.id, req.chatUser);
        if (await existeBloqueio(postgres.pool, req.chatUser.id, outroID)) throw erro(404, "Conversa não encontrada.");
        const agora = Date.now();
        const atuais = (digitandoPorConversa.get(conversa.id) || []).filter((item) => item.expiraEm > agora && item.usuarioID !== req.chatUser.id);
        if (atuais.length) digitandoPorConversa.set(conversa.id, atuais);
        else digitandoPorConversa.delete(conversa.id);
        return res.json({ sucesso: true, digitando: atuais.length > 0, nome: atuais[0]?.nome || "" });
    } catch (e) {
        return responderErro(res, e, "Não foi possível consultar quem está digitando.");
    }
});

module.exports = router;
