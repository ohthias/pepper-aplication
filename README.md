# robot-aplication

Uma aplicação em Python com Flask projetada para permitir que um robô interaja com seu ambiente. Este projeto integra visão computacional para detectar cartões coloridos e fornece uma interface web para gerenciar respostas faladas, permitindo comportamentos dinâmicos e interativos do robô.

---

## 🚀 Principais Funcionalidades

* **Detecção de Cor de Cartões**: Utiliza OpenCV para identificar e classificar cartões com base na cor predominante (ex: Vermelho, Verde, Azul, Amarelo, Roxo) a partir da câmera.
* **Gerenciamento de Fala do Robô**: Disponibiliza um endpoint de API para enfileirar e gerenciar mensagens faladas pelo robô.
* **Interface Web de Controle**: Aplicação Flask simples com interface intuitiva para iniciar detecções e monitorar estados.
* **Arquitetura Modular**: Separação entre lógica de visão computacional (`detector.py`) e aplicação web (`app.py`).
* **Integração com Pepper**: Inclui pacote de comportamento (`LeiaMetria/`) pronto para deploy em robôs Pepper ou NAO.

---

## 🛠️ Tecnologias Utilizadas

### Linguagens

* Python
* JavaScript

### Bibliotecas e Frameworks

* **Flask** – Framework web em Python
* **OpenCV (cv2)** – Biblioteca de visão computacional
* **NumPy** – Computação numérica
* **HTML/CSS** – Interface web

## 📦 Pré-requisitos

Antes de começar, instale:

* Python 3.x
* pip
* Git

## ⚙️ Instalação e Configuração

### 1. Clonar o repositório

```bash
git clone https://github.com/ohthias/robot-aplication.git
cd robot-aplication
```

### 2. Instalar dependências

```bash
pip install -r requiriments.txt
```

### 3. Deploy do comportamento no robô (Opcional)

1. Copie a pasta `LeiaMetria/` para o robô
2. Carregue via Choregraphe (`.pml` ou `.xar`)
3. Garanta que o robô e o servidor Flask estejam na mesma rede

### 4. Executar a aplicação

```bash
python app.py
```

Acesse:
[http://127.0.0.1:5000](http://127.0.0.1:5000)

## 💡 Uso

### Interface Web

Na página principal você pode:

* Iniciar detecção
* Ver resultados
* Enviar falas para o robô

### API

| Método | Endpoint      | Descrição                    |
| ------ | ------------- | ---------------------------- |
| GET    | `/`           | Página principal             |
| POST   | `/detect`     | Detecta cor do cartão        |
| POST   | `/speak`      | Envia mensagem para o robô   |
| GET    | `/has_speech` | Verifica mensagens pendentes |

Exemplo de resposta:

```json
{"color": "Red", "message": "Card detected: Red"}
```

## 🔧 Configuração

### Faixas de Cor (HSV)

Arquivo: `detector.py`

```python
COLOR_RANGES = {
    "Vermelho": [
        (np.array([0, 100, 100]), np.array([10, 255, 255])),
        (np.array([160, 100, 100]), np.array([180, 255, 255]))
    ],
    "Verde": [(np.array([35, 80, 80]), np.array([85, 255, 255]))],
    "Azul": [(np.array([100, 120, 80]), np.array([140, 255, 255]))],
    "Amarelo": [(np.array([20, 100, 100]), np.array([30, 255, 255]))],
    "Roxo": [(np.array([140, 100, 100]), np.array([160, 255, 255]))],
}
```

Você pode ajustar esses valores conforme iluminação ou novos cartões.

### Debug do Flask

```python
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
```
