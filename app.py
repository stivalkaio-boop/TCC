from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session
import mysql.connector
 
app = Flask(__name__)
app.secret_key = 'TCC_2026'

def obter_conexao():
    return mysql.connector.connect(
        host='localhost',
        user='root',
        password='',
        port=3306,
        database='almoxarifado',
        charset='utf8mb4'   # necessário para gravar "Saída" com acento
    )
 
def admin_obrigatorio(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if 'usuario_id' not in session:
            return redirect(url_for('login'))
        if session.get('usuario_tipo') != 'admin':
            return redirect(url_for('painel_usuario'))
        return func(*args, **kwargs)
    return wrapper
 
# ---------------------------------------------------------------
# Função que grava no histórico.
# Chame SEMPRE antes do commit(), para o registro entrar na mesma
# transação da operação (se a operação falhar, o histórico também não grava).
# ---------------------------------------------------------------
def registrar_historico(cursor, produto_nome, tipo, quantidade=0):
    usuario = session.get('usuario_nome', 'desconhecido')
    cursor.execute(
        "INSERT INTO historico (produto_nome, tipo_movimentacao, quantidade, usuario) "
        "VALUES (%s, %s, %s, %s)",
        (produto_nome, tipo, quantidade, usuario)
    )
 
 
# 1. Página de login
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        usuario = request.form.get('username')
        senha = request.form.get('password')
 
        conexao_bd = cursor = None
        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor(dictionary=True)
 
            cursor.execute(
                "SELECT * FROM usuarios WHERE nome = %s AND senha = %s",
                (usuario, senha)
            )
            usuario_encontrado = cursor.fetchone()
 
            if not usuario_encontrado:
                return "Usuário ou senha incorretos!"
 
            session['usuario_id'] = usuario_encontrado['id']
            session['usuario_nome'] = usuario_encontrado['nome']
            session['usuario_tipo'] = usuario_encontrado['tipo']
 
            # Registra o login no relatório
            registrar_historico(cursor, '-', 'Login', 0)
            conexao_bd.commit()
 
        except mysql.connector.Error as erro:
            return f"Erro ao fazer login: {erro}"
        finally:
            if cursor:
                cursor.close()
            if conexao_bd:
                conexao_bd.close()
 
        if session['usuario_tipo'] == 'admin':
            return redirect(url_for('painel'))
        return redirect(url_for('painel_usuario'))
 
    return render_template('index.html')
 
 
# 2. Página Inicial do Usuário
@app.route('/inicial_usuario')
def painel_usuario():
    return render_template('inicial_usuario.html')
 
 
# 3. Página Inicial (admin)
@app.route('/INICIAL')
def painel():
    conexao_bd = obter_conexao()
    cursor = conexao_bd.cursor(dictionary=True)
 
    cursor.execute("SELECT * FROM usuarios WHERE id = %s;", (session['usuario_id'],))
    usuario_logado = cursor.fetchone()
 
    cursor.execute("SELECT * FROM usuarios;")
    resultado = cursor.fetchall()
 
    cursor.close()
    conexao_bd.close()
 
    return render_template('INICIAL.html', resultado=resultado, usuario=usuario_logado)
 
 
# 4. Página de Itens
@app.route('/Itens')
def Itens():
    conexao_bd = obter_conexao()
    cursor = conexao_bd.cursor()
    cursor.execute("SELECT * FROM Itens;")
    resultado = cursor.fetchall()
 
    cursor.close()
    conexao_bd.close()
 
    return render_template('Itens.html', resultado=resultado)
 
 
# 5. Página de adicionar
@app.route('/adicionar', methods=['GET', 'POST'])
def adicionar():
    if request.method == 'POST':
        nome = request.form.get('nome')
        categoria = request.form.get('categoria')
        quantidade = request.form.get('quantidade', type=int, default=0)
        preco = request.form.get('preco')
        foto = request.form.get('foto') or ''
        if foto:
            foto = 'static/' + foto
 
        conexao_bd = cursor = None
        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor()
 
            cursor.execute(
                "INSERT INTO Itens (nome, categoria, quantidade_estoque, preco_unitario, foto) "
                "VALUES (%s, %s, %s, %s, %s)",
                (nome, categoria, quantidade, preco, foto)
            )
            registrar_historico(cursor, nome, 'Cadastro', quantidade)
            conexao_bd.commit()
 
            return redirect(url_for('Itens'))
 
        except mysql.connector.Error as erro:
            if conexao_bd:
                conexao_bd.rollback()
            return f"Erro ao salvar o item: {erro}"
        finally:
            if cursor:
                cursor.close()
            if conexao_bd:
                conexao_bd.close()
 
    return render_template('adicionar.html')
 
 
# 6. Página de retirar / movimentar
@app.route('/retirar', methods=['GET', 'POST'])
def retirar():
    if request.method == 'POST':
        operacao = request.form.get('operacao')
        nome = request.form.get('nome')
        quantidade = request.form.get('quantidade', type=int)
 
        if not nome or not quantidade or quantidade <= 0:
            return "Informe o nome do item e uma quantidade maior que zero."
 
        if operacao == 'Saida':
            tipo = 'Saída'
            comando = ("UPDATE Itens SET quantidade_estoque = quantidade_estoque - %s "
                       "WHERE nome = %s AND quantidade_estoque >= %s")
            valores = (quantidade, nome, quantidade)
        elif operacao == 'Entrada':
            tipo = 'Entrada'
            comando = ("UPDATE Itens SET quantidade_estoque = quantidade_estoque + %s "
                       "WHERE nome = %s")
            valores = (quantidade, nome)
        else:
            return "Operação inválida!"
 
        conexao_bd = cursor = None
        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor()
 
            cursor.execute(comando, valores)
 
            # Nenhuma linha alterada = item não existe ou estoque insuficiente
            if cursor.rowcount == 0:
                conexao_bd.rollback()
                return "Item não encontrado ou estoque insuficiente."
 
            registrar_historico(cursor, nome, tipo, quantidade)
            conexao_bd.commit()
 
            return redirect(url_for('Itens'))
 
        except mysql.connector.Error as erro:
            if conexao_bd:
                conexao_bd.rollback()
            return f"Erro ao registrar a movimentação: {erro}"
        finally:
            if cursor:
                cursor.close()
            if conexao_bd:
                conexao_bd.close()
 
    return render_template('retirar.html')
 
 
# 7. Página de Usuários (somente admin)
@app.route('/usuarios', methods=['GET', 'POST'])
def usuarios():
    if request.method == 'POST':
        nome = request.form.get('nome_usuario')
        senha = request.form.get('senha_usuario')
        tipo = request.form.get('tipo_user_admin', 'user')
 
        conexao_bd = cursor = None
        try:
            conexao_bd = obter_conexao()
            cursor = conexao_bd.cursor()
 
            cursor.execute(
                "INSERT INTO usuarios (nome, senha, tipo) VALUES (%s, %s, %s)",
                (nome, senha, tipo)
            )
            registrar_historico(cursor, f'Novo usuário: {nome}', 'Cadastro de usuário', 0)
            conexao_bd.commit()
 
            return redirect(url_for('usuarios'))
 
        except mysql.connector.Error as erro:
            if conexao_bd:
                conexao_bd.rollback()
            return f"Erro ao cadastrar o usuário: {erro}"
        finally:
            if cursor:
                cursor.close()
            if conexao_bd:
                conexao_bd.close()
 
    return render_template('usuarios.html')
 
 
# 9. Página do histórico (relatório)
@app.route('/historico')
def historico():
    conexao_bd = obter_conexao()
    cursor = conexao_bd.cursor(dictionary=True)
 
    cursor.execute(
        "SELECT id, produto_nome, tipo_movimentacao, quantidade, usuario, "
        "DATE_FORMAT(data_movimentacao, '%d/%m/%Y %H:%i:%s') AS data_formatada "
        "FROM historico "
        "ORDER BY data_movimentacao ASC, id ASC "
        "LIMIT 500"
    )
    movimentacoes = cursor.fetchall()
 
    cursor.close()
    conexao_bd.close()
 
    return render_template('historico.html', movimentacoes=movimentacoes)
 
 
# 10. Página de teste de conexão
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