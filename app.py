from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import mysql.connector
 
app = Flask(__name__)
app.secret_key = 'TCC_2026'

def obter_conexao():
    return mysql.connector.connect(
        host='db',
        user='root',
        password='mysql_root',
        port=3306,
        database='almoxarifado',
        charset='utf8mb4'   # necessário para gravar "Saída" com acento
    )

def login_obrigatorio(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if 'usuario_id' not in session:
            return redirect(url_for('login'))
        return func(*args, **kwargs)
    return wrapper

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
@login_obrigatorio
def painel_usuario():
    return render_template('inicial_usuario.html')
 
 
# 3. Página Inicial (admin)
@app.route('/INICIAL')
@admin_obrigatorio
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
@login_obrigatorio
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
@login_obrigatorio
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
@login_obrigatorio
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
@admin_obrigatorio
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
@login_obrigatorio
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
 
 
# 10. Página de conexão
@app.route('/conexao')
def conexao():
    try:
        conexao_bd = obter_conexao()
        conexao_bd.close()
        return "Conexão com o banco de dados [almoxarifado] realizada com sucesso!"
    except mysql.connector.Error as erro:
        return f"Erro ao conectar ao banco de dados: {erro}"






 # 11. APIs (JSON) para o app React Native
# Protege todas as rotas/api/(menos o login)/api/usuarios é só para admin.
@app.before_request
def proteger_api():
    if not request.path.startswith('/api/') or request.path == '/api/login':
        return None
    if 'usuario_id' not in session:
        return jsonify(erro='Não autenticado'), 401
    if request.path.startswith('/api/usuarios') and session.get('usuario_tipo') != 'admin':
        return jsonify(erro='Apenas administradores'), 403


# Erros de banco nas rotas /api/ voltam como JSON
@app.errorhandler(mysql.connector.Error)
def erro_banco(erro):
    if not request.path.startswith('/api/'):
        raise erro
    return jsonify(erro=f'Erro no banco de dados: {erro}'), 500


# POST /api/login   {"nome": "maria", "senha": "1234"}
@app.route('/api/login', methods=['POST'])
def api_login():
    dados = request.get_json(silent=True) or request.form

    con = obter_conexao()
    cursor = con.cursor(dictionary=True)
    cursor.execute(
        "SELECT id, nome, tipo FROM usuarios WHERE nome = %s AND senha = %s",
        (dados.get('nome'), dados.get('senha'))
    )
    usuario = cursor.fetchone()
    cursor.close()
    con.close()

    if not usuario:
        return jsonify(erro='Usuário ou senha incorretos'), 401

    session['usuario_id'] = usuario['id']
    session['usuario_nome'] = usuario['nome']
    session['usuario_tipo'] = usuario['tipo']
    return jsonify(usuario)


# GET /api/itens            (opcional: ?q=texto para buscar por nome ou categoria)
@app.route('/api/itens', methods=['GET'])
def api_listar_itens():
    busca = '%' + request.args.get('q', '').strip() + '%'

    con = obter_conexao()
    cursor = con.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM Itens WHERE nome LIKE %s OR categoria LIKE %s ORDER BY nome",
        (busca, busca)
    )
    itens = cursor.fetchall()
    cursor.close()
    con.close()

    return jsonify(itens)


# GET /api/itens/<id>
@app.route('/api/itens/<int:item_id>', methods=['GET'])
def api_buscar_item(item_id):
    con = obter_conexao()
    cursor = con.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Itens WHERE id = %s", (item_id,))
    item = cursor.fetchone()
    cursor.close()
    con.close()

    if not item:
        return jsonify(erro='Item não encontrado'), 404
    return jsonify(item)


# POST /api/itens   {"nome": "Parafuso", "categoria": "Ferragens", "quantidade": 10, "preco": "12,50", "foto": "parafuso.png"}
@app.route('/api/itens', methods=['POST'])
def api_criar_item():
    dados = request.get_json(silent=True) or request.form

    nome = dados.get('nome')
    categoria = dados.get('categoria') or ''
    foto = dados.get('foto') or ''
    if foto:
        foto = 'static/' + foto   # mesmo padrão da rota /adicionar

    try:
        quantidade = int(dados.get('quantidade') or 0)
        preco = float(str(dados.get('preco') or 0).replace(',', '.'))
    except (ValueError, TypeError):
        return jsonify(erro='Quantidade ou preço inválido'), 400
    if not nome or quantidade < 0 or preco < 0:
        return jsonify(erro='Informe o nome; quantidade e preço não podem ser negativos'), 400

    item = (nome, categoria, quantidade, preco, foto)
    query = ("INSERT INTO Itens (nome, categoria, quantidade_estoque, preco_unitario, foto) "
             "VALUES (%s, %s, %s, %s, %s);")

    con = obter_conexao()
    cursor = con.cursor()
    cursor.execute(query, item)
    registrar_historico(cursor, nome, 'Cadastro', quantidade)
    con.commit()
    novo_id = cursor.lastrowid
    cursor.close()
    con.close()

    return jsonify(id=novo_id), 201


# POST /api/movimentacoes   {"operacao": "Entrada" ou "Saida", "nome": "Parafuso", "quantidade": 5}
@app.route('/api/movimentacoes', methods=['POST'])
def api_movimentar():
    dados = request.get_json(silent=True) or request.form

    operacao = dados.get('operacao')
    nome = dados.get('nome')
    try:
        quantidade = int(dados.get('quantidade') or 0)
    except (ValueError, TypeError):
        quantidade = 0
    if not nome or quantidade <= 0:
        return jsonify(erro='Informe o nome do item e uma quantidade maior que zero'), 400

    if operacao == 'Entrada':
        tipo = 'Entrada'
        query = "UPDATE Itens SET quantidade_estoque = quantidade_estoque + %s WHERE nome = %s"
        item = (quantidade, nome)
    elif operacao == 'Saida':
        tipo = 'Saída'
        query = ("UPDATE Itens SET quantidade_estoque = quantidade_estoque - %s "
                 "WHERE nome = %s AND quantidade_estoque >= %s")
        item = (quantidade, nome, quantidade)
    else:
        return jsonify(erro='Operação inválida. Use "Entrada" ou "Saida"'), 400

    con = obter_conexao()
    cursor = con.cursor()
    cursor.execute(query, item)

    # Nenhuma linha alterada = item não existe ou estoque insuficiente
    if cursor.rowcount == 0:
        cursor.close()
        con.close()
        return jsonify(erro='Item não encontrado ou estoque insuficiente'), 409

    registrar_historico(cursor, nome, tipo, quantidade)
    con.commit()

    cursor.execute("SELECT quantidade_estoque FROM Itens WHERE nome = %s", (nome,))
    estoque_atual = cursor.fetchone()[0]
    cursor.close()
    con.close()

    return jsonify(estoque_atual=estoque_atual), 201


# GET /api/historico        (opcional: ?limit=100, máximo 500)
@app.route('/api/historico', methods=['GET'])
def api_historico():
    limite = min(max(request.args.get('limit', 100, type=int), 1), 500)

    # como há parâmetro (LIMIT), os % do DATE_FORMAT precisam ser escritos como %%
    query = ("SELECT id, produto_nome, tipo_movimentacao, quantidade, usuario, "
             "DATE_FORMAT(data_movimentacao, '%%d/%%m/%%Y %%H:%%i:%%s') AS data_formatada "
             "FROM historico ORDER BY data_movimentacao DESC, id DESC LIMIT %s")

    con = obter_conexao()
    cursor = con.cursor(dictionary=True)
    cursor.execute(query, (limite,))
    movimentacoes = cursor.fetchall()
    cursor.close()
    con.close()

    return jsonify(movimentacoes)


# GET /api/usuarios         (só admin — sem a senha)
@app.route('/api/usuarios', methods=['GET'])
def api_listar_usuarios():
    con = obter_conexao()
    cursor = con.cursor(dictionary=True)
    cursor.execute("SELECT id, nome, tipo FROM usuarios ORDER BY nome")
    lista = cursor.fetchall()
    cursor.close()
    con.close()

    return jsonify(lista)


# POST /api/usuarios        (só admin)   {"nome": "maria", "senha": "1234", "tipo": "user" ou "admin"}
@app.route('/api/usuarios', methods=['POST'])
def api_criar_usuario():
    dados = request.get_json(silent=True) or request.form

    nome = dados.get('nome')
    senha = dados.get('senha')
    tipo = dados.get('tipo') or 'user'
    if not nome or not senha or tipo not in ('admin', 'user'):
        return jsonify(erro='Informe nome, senha e um tipo válido ("admin" ou "user")'), 400

    con = obter_conexao()
    cursor = con.cursor()
    cursor.execute(
        "INSERT INTO usuarios (nome, senha, tipo) VALUES (%s, %s, %s)",
        (nome, senha, tipo)
    )
    registrar_historico(cursor, f'Novo usuário: {nome}', 'Cadastro de usuário', 0)
    con.commit()
    novo_id = cursor.lastrowid
    cursor.close()
    con.close()

    return jsonify(id=novo_id), 201

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')