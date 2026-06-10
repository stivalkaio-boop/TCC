from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)

# 1. Página de login
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        usuario = request.form.get('username')
        senha = request.form.get('password')
        
        if usuario == "admin" and senha == "1234":
            return redirect(url_for('painel'))
        else:
            return "Usuário ou senha incorretos!"
            
    return render_template('index.html')

# 2. Página Inicial / Painel
@app.route('/INICIAL')
def painel():
    return render_template('INICIAL.html')

# 3. Página de Itens
@app.route('/Itens')
def Itens():
    return render_template('Itens.html') 

# 4. Página de Conexão (Movida para o lugar correto)
@app.route('/conexao')
def conexao():
    try:
        # Tenta conectar ao banco
        conexao_bd = mysql.connector.connect(
            host='127.0.0.1', # Geralmente usa-se localhost ou 127.0.0.1 para o banco local
            user='root',      # O parâmetro correto é 'user', não 'username'
            password='',
            port=3306,
            database='conexao'
        )
        
        # Se chegou até aqui, funcionou! Vamos fechar a conexão.
        conexao_bd.close()
        return "Conexão com o banco de dados realizada com sucesso!"
        
    except mysql.connector.Error as erro:
        # Se der erro no banco, ele te mostra o motivo na tela
        return f"Erro ao conectar ao banco de dados: {erro}"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')