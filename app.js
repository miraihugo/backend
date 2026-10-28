//1. Dependências e Middlewares
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const app = express();
const bodyParser = require('body-parser');
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use((req, res, next) => {
    req.body = req.body || {};
    next();
});

const routeUsuario = require("./route/routeUsuario");
const routeCategorias = require("./route/routeCategorias");
const routeProdutos = require("./route/routeProdutos");
const routeClientes = require("./route/routeClientes");
const routeEstoque = require("./route/routeEstoque");
const routePedidos = require("./route/routePedidos");
const routeEntradas = require("./route/routeEntradas");
const routeSaidas = require("./route/routeSaidas");
const routeFornecedores = require("./route/routeFornecedores");
const routeFuncionarios = require("./route/routeFuncionarios");


//2. Controle de CORS (Headers & OPTIONS)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));
//3. Definição de Rotas (Exemplo)

app.use("/usuario",routeUsuario);
app.use("/categorias", routeCategorias);
app.use("/produtos", routeProdutos);
app.use("/clientes", routeClientes);
app.use("/estoque", routeEstoque);
app.use("/pedidos", routePedidos);
app.use("/entradas", routeEntradas);
app.use("/saidas", routeSaidas);
app.use("/fornecedores", routeFornecedores);
app.use("/funcionarios", routeFuncionarios);


app.get('/teste', (req, res) => {
    res.status(200).send({
        mensagem: 'Tudo OK'
    });
});
//4. Tratamento de Erros (Fallback & Handler)
app.use((req,res,next)=>{
      const erro = new Error("Não encontrado!");
      erro.status = 404;
      next(erro);
});
app.use((error,req,res,next)=>{
        res.status(error.status || 500);
        return res.json({
            erro:{
                 mensagem:error.message
            }  })
})

module.exports = app
