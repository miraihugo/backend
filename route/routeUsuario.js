const express = require('express');
const router = express.Router();
const mysql = require("../mysql").pool;
const bcrypt = require("bcryptjs");

const publicUserColumns = "id_usu, nome, email, contato, genero, ativo, criado_em, atualizado_em";

router.post('/login', (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const senha = typeof req.body.senha === "string" ? req.body.senha : "";

  if (!email || !senha) {
    return res.status(400).send({ error: "E-mail e senha são obrigatórios." });
  }

  mysql.getConnection(async (error, conn) => {
    if (error) return res.status(500).send({ error });

    conn.query(
      `SELECT id_usu, nome, email, senha, contato, genero, ativo, criado_em, atualizado_em FROM usuarios WHERE email = ? LIMIT 1`,
      [email],
      async (error, resultado) => {
        conn.release();

        if (error) return res.status(500).send({ error });

        const usuario = resultado && resultado[0];

        if (!usuario) {
          return res.status(401).send({ error: "Credenciais inválidas." });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
          return res.status(401).send({ error: "Credenciais inválidas." });
        }

        if (usuario.ativo === 0) {
          return res.status(403).send({ error: "Usuário inativo." });
        }

        const { senha: _, ...usuarioSemSenha } = usuario;

        return res.status(200).send({
          mensagem: "Login realizado com sucesso!",
          usuario: usuarioSemSenha
        });
      }
    );
  });
});

router.get('/', (req, res) => {
mysql.getConnection((error, conn) => {
if (error) return res.status(500).send({ error });
conn.query(`SELECT ${publicUserColumns} FROM usuarios`, (error, resultado) => {
conn.release();
if (error) return res.status(500).send({ error });
res.status(200).send({ usuario: resultado });
});
});
});

router.get('/:id', (req, res, next) => {
mysql.getConnection((error, conn) => {
if (error) return res.status(500).send({ error: error });
conn.query(
`SELECT ${publicUserColumns} FROM usuarios WHERE id_usu = ?`,
[req.params.id],
(error, resultado) => {
conn.release();
if (error) return res.status(500).send({ error: error });
res.status(200).send({ usuario: resultado });
}
);
});
});


router.post('/', async (req, res, next) => {
if (typeof req.body.nome !== "string" || !req.body.nome.trim() ||
typeof req.body.email !== "string" || !req.body.email.trim() ||
typeof req.body.senha !== "string" || !req.body.senha) {
return res.status(400).send({ error: "Nome, e-mail e senha são obrigatórios." });
}
const senha = await bcrypt.hash(req.body.senha, 12);
mysql.getConnection((error, conn) => {
if (error) return res.status(500).send({ error });
conn.query(
"INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
[req.body.nome.trim(), req.body.email.trim(), senha],
(error, resultado) => {
conn.release();
if (error) return res.status(500).send({ error });
res.status(201).send({
mensagem: "Usuário criado com sucesso!",
id_usuario: resultado.insertId
});
}
);
});
});


router.patch('/:id', async (req, res, next) => {
if (typeof req.body.nome !== "string" || !req.body.nome.trim() ||
typeof req.body.email !== "string" || !req.body.email.trim() ||
typeof req.body.senha !== "string" || !req.body.senha) {
return res.status(400).send({ error: "Nome, e-mail e senha são obrigatórios." });
}
const senha = await bcrypt.hash(req.body.senha, 12);
mysql.getConnection((error, conn) => {
if (error) return res.status(500).send({ error });
conn.query(
"UPDATE usuarios SET nome = ?, email = ?, senha = ? WHERE id_usu = ?",
[req.body.nome.trim(), req.body.email.trim(), senha, req.params.id],
(error, resultado) => {
conn.release();
if (error) return res.status(500).send({ error });
res.status(202).send({
mensagem: "Usuário atualizado com sucesso!"
});
}
);
});
});


router.delete('/:id', (req, res, next) => {
mysql.getConnection((error, conn) => {
if (error) return res.status(500).send({ error });
conn.query(
"DELETE FROM usuarios WHERE id_usu = ?",
[req.params.id],
(error, resultado) => {
conn.release();
if (error) return res.status(500).send({ error });
res.status(202).send({
mensagem: "Usuário removido com sucesso!"
});
}
);
});
});




// 3. Exportação do Módulo
module.exports = router;
// Solicita uma conexão ao pool, executa a query SQL, libera a conexão para o pool imediatamente após a resposta e trata possíveis erros de execução.
