from flask import Flask, render_template, request, redirect, url_for

# CORRIGIDO: Agora com dois underlines de cada lado de name
app = Flask(__name__)

# 1. Rota da sua página de login atual
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

# 2. Rota para a NOVA PÁGINA (Sua tela com a navbar)
@app.route('/INICIAL')
def painel():
    return render_template('INICIAL.html')


@app.route('/Itens')
def Itens():
    # Esse código vai procurar um arquivo chamado 'itens.html' na sua pasta templates
    return render_template('Itens.html') 

if __name__ == '__main__':
    app.run(debug=True)