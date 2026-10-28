# 1. FLUXO LOCAL DE VERSIONAMENTO
git init
// Inicializa um novo repositório Git local
git status
// Verifica o estado atual e arquivos modificados
git add .

// Adiciona todas as alterações para a área de preparação
git commit -m "mensagem"
// Grava as alterações com uma mensagem explicativa
git push -u origin main
// Envia os commits locais para o repositório remoto
# 2. CONFIGURAÇÃO & CONEXÃO REMOTA
# Conectar ao repositório remoto
git remote add origin [link removed]
// Vincula seu repositório local ao GitHub
# Identificação global do usuário
git config --global user.email "email@gmail.com"
git config --global user.name "seu usuário"
// Configura suas credenciais para os commits
# Clonar projeto existente
git clone [link removed]
// Baixa uma cópia funcional do projeto remoto
