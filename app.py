from flask import Flask, render_template, request, redirect, url_for 
import mysql.connector

app = Flask(__name__)

def obter_conexao():
    return mysql.connector.connect(
        host='localhost', 
        user='root',      
        password='root',
        port=3306,
        database='almoxarifado'
    )


# 1. Página de login
@app.route('/', methods=['GET', 'POST'])
def login():

    if request.method == 'POST':
        usuario = request.form.get('username')
        senha = request.form.get('password')
        
        conexao = obter_conexao()
        cursor = conexao.cursor(dictionary=True)

        query = "SELECT * FROM perfil WHERE nome = %s AND senha = %s"
        cursor.execute(query, ( Nome, senha))
        usuario_encontrado = cursor.fetchone()

        if usuario == "admin" and senha == "1234":
            return redirect(url_for('painel'))
        else:
            return "Usuário ou senha incorretos!"
            
    return render_template('index.html')

# 2. Página Inicial / Painel
@app.route('/INICIAL')
def painel():
 
    conexao_bd = obter_conexao()
    cursor = conexao_bd.cursor()
    cursor.execute("SELECT * FROM usuarios;")
    resultado = cursor.fetchall()

    return render_template('INICIAL.html', resultado = resultado) 

# 3. Página de Itens
@app.route('/Itens')
def Itens():

    conexao_bd = obter_conexao()
    cursor = conexao_bd.cursor()
    cursor.execute("SELECT * FROM itens;")
    resultado = cursor.fetchall()

    return render_template('Itens.html', resultado = resultado) 

# 4. Pagina de adicionar
@app.route('/adicionar', methods=['GET', 'POST'])
def adicionar():

    if request.method == 'POST':
        # Aqui dentro vai o código que pega os dados e salva no banco...
        nome = request.form.get('nome')
        categoria = request.form.get('categoria')
        quantidade = request.form.get('quantidade')
        preco = request.form.get('preco')
        foto = request.form.get('foto')
        foto = 'static/' + foto

        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor()

            comando = "INSERT INTO itens (nome, categoria, quantidade_estoque, preco_unitario, foto) VALUES (%s, %s, %s, %s, %s)"
            valores = (nome, categoria, quantidade, preco, foto)
            cursor.execute(comando, valores)
            conexao_bd.commit()

            return redirect(url_for('Itens'))

        except mysql.connector.Error as erro:
            return f"Erro ao salvar o item: {erro}"
    
    return render_template('adicionar.html')

# 5. Pagina de retirar
@app.route('/retirar', methods=['GET', 'POST'])
def retirar():
    if request.method == 'POST':
        # Aqui dentro vai o código que pega os dados e salva no banco...
        operacao = request.form.get('operacao')
        nome = request.form.get('nome')
        categoria = request.form.get('categoria')
        quantidade = request.form.get('quantidade')

        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor()

            if operacao == 'Saida':        
                comando = "UPDATE Itens SET quantidade_estoque = quantidade_estoque - %s WHERE nome = %s"
                valores = (quantidade, nome)
                
                cursor.execute(comando, valores)
            
            if operacao == 'Entrada':        
                comando = "UPDATE Itens SET quantidade_estoque = quantidade_estoque + %s WHERE nome = %s"
                valores = (quantidade, nome)
                
                cursor.execute(comando, valores)

            conexao_bd.commit()
                    
            cursor.close()
            conexao_bd.close()
            
            return redirect(url_for('Itens'))
            
        except mysql.connector.Error as erro:
            return f"Erro ao registrar a retirada: {erro}"
            

    return render_template('retirar.html')

# 6. Pagina de Usuario
@app.route('/usuarios', methods=['GET', 'POST'])
def usuarios():

    if request.method == 'POST':
        nome = request.form.get('nome_usuario')
        senha = request.form.get('senha_usuario')

        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor()

            comando = "INSERT INTO usuarios (nome, senha) VALUES (%s, %s)"
            valores = (nome, senha)
            cursor.execute(comando, valores)
            conexao_bd.commit()
       
            return redirect(url_for('usuarios'))

        except mysql.connector.Error as erro:
            return f"Erro ao cadastrar o usuario: {erro}"

    return render_template('usuarios.html') 


# 7. USUARIO OU ADMIN


# 8. Página de Conexão
@app.route('/conexao')
def conexao():
    
    try:
        conexao_bd = obter_conexao()
        conexao_bd.close()
        return "Conexão com o banco de dados [almoxarifado] realizada com sucesso!"
    except mysql.connector.Error as erro:
        return f"Erro ao conectar ao banco de dados: {erro}"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')