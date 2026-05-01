"""Aplicação Flask para detectar cartões e controlar mensagens de fala.

Este arquivo expõe rotas HTTP simples para:
- renderizar a página inicial;
- acionar a detecção de cartão;
- armazenar uma mensagem pendente para ser falada;
- permitir que o cliente consulte se existe uma fala aguardando.

Para iniciantes:
- Flask é um framework web em Python.
- `@app.route(...)` define uma URL e a função que responde a ela.
- `jsonify(...)` transforma um dicionário Python em JSON.
"""

from flask import Flask, render_template, jsonify, request
from detector import detectar_cartao
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Guarda a próxima mensagem que o sistema deve falar.
# Quando `texto` tiver conteúdo, `/checar_fala` devolve essa fala ao cliente.
fala_pendente = {"texto": None, "tipo": None}

@app.route("/")
def index():
    """Abre a página principal da aplicação."""
    return render_template("index.html")

@app.route("/detectar")
def detectar():
    """Executa a detecção do cartão e devolve o resultado em JSON."""
    resultado = detectar_cartao()
    if resultado:
        return jsonify({"success": True, "cor": resultado["cor"], "forma": resultado["forma"]})
    return jsonify({"success": False})

@app.route("/aguardando", methods=["POST"])
def aguardando():
    """Define uma mensagem de espera para o sistema falar."""
    fala_pendente["texto"] = "Ola! Vamos aprender? Aproxime um cartao na câmera do computador para comecarmos!"
    fala_pendente["tipo"]  = "aguardando"
    return jsonify({"ok": True})

@app.route("/acerto", methods=["POST"])
def acerto():
    """Define uma mensagem de parabéns quando a resposta está correta."""
    fala_pendente["texto"] = "Parabens! Voce acertou! Continue assim!"
    fala_pendente["tipo"]  = "acerto"
    return jsonify({"ok": True})

@app.route("/erro", methods=["POST"])
def erro():
    """Define uma mensagem de erro com dica, dependendo da tentativa."""
    body     = request.get_json()
    tentativa = body.get("tentativa", 1)
    dica      = body.get("dica", "")

    if tentativa == 1:
        fala_pendente["texto"] = "Ops, nao foi dessa vez. Aqui vai uma dica: " + dica
    elif tentativa == 2:
        fala_pendente["texto"] = "Vamos tentar de novo! " + dica
    else:
        fala_pendente["texto"] = "A resposta correta e: " + dica

    fala_pendente["tipo"] = "erro"
    return jsonify({"ok": True})

@app.route("/explicacao", methods=["POST"])  # 🔥 novo
def explicacao():
    """Recebe um texto explicativo e o deixa pendente para ser falado."""
    body  = request.get_json()
    texto = body.get("texto", "")
    fala_pendente["texto"] = texto
    fala_pendente["tipo"]  = "explicacao"
    return jsonify({"ok": True})

@app.route("/checar_fala")
def checar_fala():
    """Verifica se existe alguma fala pendente e a devolve uma única vez."""
    if fala_pendente["texto"]:
        texto = fala_pendente["texto"]
        tipo  = fala_pendente.get("tipo", "")
        fala_pendente["texto"] = None
        fala_pendente["tipo"]  = None
        return jsonify({"falar": True, "texto": texto, "tipo": tipo})
    return jsonify({"falar": False})

if __name__ == "__main__":
    # Inicia o servidor local em todas as interfaces de rede, na porta 5000.
    app.run(host="0.0.0.0", port=5000, debug=True)