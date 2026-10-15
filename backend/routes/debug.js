const express = require("express");
const router = express.Router();

router.get("/debug-sessao", (req, res) => {
    const usuario = req.session?.usuario;

    if (!usuario) {
        return res.json({ erro: "Nenhum usuário na sessão" });
    }

    res.json({
        usuario,
        checks: {
            tipoUsuario: {
                valor: usuario.tipoUsuario,
                normalizado: String(usuario.tipoUsuario || "")
                    .trim()
                    .toUpperCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, ""),
                esperado: "RESPONSAVEL",
                ok:
                    String(usuario.tipoUsuario || "")
                        .trim()
                        .toUpperCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "") === "RESPONSAVEL",
            },
            perfil: {
                valor: usuario.perfil,
                normalizado: String(usuario.perfil || "")
                    .trim()
                    .toUpperCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, ""),
                esperado: "RESPONSAVEL",
                ok:
                    String(usuario.perfil || "")
                        .trim()
                        .toUpperCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "") === "RESPONSAVEL",
            },
            setorID: {
                valor: usuario.setorID,
                temValor: !!usuario.setorID,
                ok: !!usuario.setorID,
            },
        },
    });
});

module.exports = router;
