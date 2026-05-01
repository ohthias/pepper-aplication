
/**
 * Objeto de estado global da sessão.
 * Armazena as escolhas do aluno e o progresso na rodada atual.
 *
 * @property {string} nivel       - Nível escolar selecionado (chave do JSON de conteúdo)
 * @property {string} forma       - Forma geométrica do cartão (quadrado | triangulo | circulo)
 * @property {string} perguntaId  - ID da pergunta ativa (ex.: "01", "02")
 * @property {number} tentativas  - Número de tentativas erradas na pergunta atual
 */
const estado = { nivel: "", forma: "", perguntaId: "01", tentativas: 0 };

/**
 * Cache do arquivo de conteúdo carregado na inicialização.
 * Estrutura esperada: { [nivel]: { [forma]: { explicacao, formula, perguntas } } }
 */
let dados = {};

/* Carrega o JSON de conteúdo ao iniciar o módulo */
fetch("../static/json/conteudo.json")
  .then((r) => r.json())
  .then((j) => (dados = j));

/* ── MAPEAMENTOS ─────────────────────────────── */

/**
 * SVGs inline para cada forma geométrica.
 * Usam variáveis CSS (--accent, --accent-pale) para respeitar o tema visual.
 * As dimensões são fixas (88px) para padronizar a exibição nos cartões.
 */
const svgFormas = {
  quadrado: `<svg viewBox="0 0 100 100" width="88" class="shape-svg"><rect x="8" y="8" width="84" height="84" fill="var(--accent-pale)" stroke="var(--accent)" stroke-width="2" rx="3"/></svg>`,
  triangulo: `<svg viewBox="0 0 100 88" width="88" class="shape-svg"><polygon points="50,4 96,84 4,84" fill="var(--accent-pale)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/></svg>`,
  circulo: `<svg viewBox="0 0 100 100" width="88" class="shape-svg"><circle cx="50" cy="50" r="42" fill="var(--accent-pale)" stroke="var(--accent)" stroke-width="2"/></svg>`,
};

/**
 * Rótulos legíveis por humanos para os níveis escolares.
 * Usados na interface para não exibir as chaves internas do JSON.
 */
const labelNivel = {
  ensinoFundamentalI: "Fund. I",
  ensinoFundamentalII: "Fund. II",
  ensinoMedio: "Ensino Médio",
};

/**
 * Rótulos legíveis por humanos para as formas geométricas.
 */
const labelForma = {
  quadrado: "Quadrado",
  triangulo: "Triângulo",
  circulo: "Círculo",
};

/**
 * Traduz a cor física do cartão detectado pela câmera
 * para a chave de nível escolar usada no JSON de conteúdo.
 *
 * Esquema de cores físico:
 *   Vermelho → Ensino Fundamental I
 *   Verde    → Ensino Fundamental II
 *   Azul     → Ensino Médio
 */
const corParaNivel = {
  Vermelho: "ensinoFundamentalI",
  Verde: "ensinoFundamentalII",
  Azul: "ensinoMedio",
};

/* ── PEPPER BRIDGE ───────────────────────────── */

/**
 * Emite um evento para o robô Pepper via ALTabletService (NAOqi).
 * Em ambientes sem o robô, exibe um indicador visual de debug no elemento
 * #pepperStatus por 2,2 segundos.
 *
 * @param {string} evento - Nome do evento (ex.: "cartao_detectado")
 * @param {string} valor  - Payload opcional concatenado ao evento com ":"
 */
function pepper(evento, valor = "") {
  try {
    /* ALTabletService é a ponte JavaScript ↔ NAOqi do Pepper */
    if (window.ALTabletService)
      window.ALTabletService.raiseEvent(evento + ":" + valor);
  } catch (e) {
    /* Falha silenciosa: o tablet pode não ter o serviço disponível */
  }

  /* Indicador visual de debug — visível apenas durante desenvolvimento */
  const el = document.getElementById("pepperStatus");
  el.textContent = "🤖 " + evento + (valor ? " → " + valor : "");
  el.classList.add("on");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("on"), 2200);
}

/**
 * Ponto de entrada para comandos enviados pelo Pepper à interface.
 * O robô pode acionar navegação, simular leitura de cartão ou resetar a sessão.
 *
 * @param {string} cmd - Comando recebido: "navigate" | "cartao" | "reset"
 * @param {string} arg - Argumento do comando (ex.: id de tela, "cor:forma")
 */
function pepperCommand(cmd, arg) {
  if (cmd === "navigate") navigate(arg);
  if (cmd === "cartao") receberCartao(...arg.split(":"));
  if (cmd === "reset") navigate("aguardando");
}

/**
 * Solicita ao backend que o Pepper fale um texto em voz alta (TTS).
 * O backend é responsável por retransmitir o texto ao serviço de fala do NAOqi.
 *
 * @param {string} texto - Texto a ser sintetizado em fala
 * @returns {Promise<Response>} Promise da requisição POST
 */
function pepperFalar(texto) {
  return fetch("/explicacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
}

/* ── NAVEGAÇÃO ───────────────────────────────── */

/**
 * Realiza a transição animada entre telas.
 * Mecanismo:
 *   1. Adiciona classe "leaving" na tela atual (dispara animação de saída).
 *   2. Após 210ms, remove a tela atual do fluxo ativo.
 *   3. Ativa a próxima tela com classe "enter" (animação de entrada).
 *   4. Remove "enter" após 420ms (fim da animação CSS).
 *
 * @param {string} id - ID do elemento HTML da tela de destino
 */
function navigate(id) {
  const cur = document.querySelector(".screen.active");
  const next = document.getElementById(id);
  if (!cur || cur === next) return; /* Nenhuma transição necessária */

  cur.classList.add("leaving");
  setTimeout(() => {
    cur.classList.remove("active", "leaving");
    next.classList.add("active", "enter");
    setTimeout(() => next.classList.remove("enter"), 420);
  }, 210);
}

/* ── LOADING OVERLAY ─────────────────────────── */

/**
 * Exibe ou oculta o overlay de carregamento global.
 * Usado durante operações assíncronas (ex.: detecção de cartão).
 *
 * @param {boolean} on - true para exibir, false para ocultar
 */
function setLoading(on) {
  document.getElementById("loadingOverlay").classList.toggle("active", on);
}

/* ── ESCANEAR CARTÃO ─────────────────────────── */

/**
 * Aciona a detecção de cartão físico via câmera no backend.
 *
 * Fluxo:
 *   1. Exibe overlay de carregamento.
 *   2. Chama GET /detectar — backend processa a imagem e retorna cor + forma.
 *   3. Converte a cor física para chave de nível via `corParaNivel`.
 *   4. Delega o processamento para `receberCartao()`.
 *   5. Oculta o overlay ao final (sucesso ou erro).
 *
 * Resposta esperada de /detectar:
 *   { success: boolean, cor: string, forma: string }
 */
function escanearCartaoReal() {
  setLoading(true);
  fetch("/detectar")
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      /* Usa "ensinoMedio" como nível padrão se a cor não for reconhecida */
      receberCartao(corParaNivel[data.cor] ?? "ensinoMedio", data.forma);
    })
    .catch(err => console.error("Erro ao detectar cartão:", err))
    .finally(() => setLoading(false));
}

/* ── RECEBER CARTÃO ──────────────────────────── */

/**
 * Processa o cartão detectado: atualiza o estado, popula a tela de confirmação
 * e navega para ela.
 *
 * Atualiza os elementos:
 *   #tagCartao        — "Forma · Nível" (badge compacto)
 *   #nivelCartao      — Rótulo do nível (ex.: "Fund. I")
 *   #nomeFormaCartao  — Nome da forma (ex.: "Quadrado")
 *   #svgFormaCartao   — Ilustração SVG inline da forma
 *
 * @param {string} nivel - Chave de nível (ex.: "ensinoFundamentalI")
 * @param {string} forma - Chave de forma (ex.: "quadrado")
 */
function receberCartao(nivel, forma) {
  /* Reinicia a sessão com os dados do novo cartão */
  Object.assign(estado, { nivel, forma, perguntaId: "01", tentativas: 0 });
  pepper("cartao_detectado", forma + "_" + nivel);

  /* Preenche a tela de confirmação do cartão */
  document.getElementById("tagCartao").textContent =
    labelForma[forma] + " · " + labelNivel[nivel];
  document.getElementById("nivelCartao").textContent = labelNivel[nivel];
  document.getElementById("nomeFormaCartao").textContent = labelForma[forma];
  document.getElementById("svgFormaCartao").innerHTML = svgFormas[forma] ?? "";

  /* Pepper anuncia o cartão detectado em voz alta */
  pepperFalar(
    `Cartão identificado! Vamos estudar ${labelForma[forma]} para ${labelNivel[nivel]}. Clique em continuar para ver o conteúdo!`,
  );
  navigate("cartaoSelecionado");
}

/* ── IR PARA CONTEÚDO ────────────────────────── */

/**
 * Exibe a tela de conteúdo teórico para a forma e nível da sessão atual.
 *
 * Popula os elementos:
 *   #tituloConteudo   — Nome da forma
 *   #svgFormaConteudo — Ilustração SVG da forma
 *   #textoConteudo    — Explicação textual do conteúdo
 *   #formulaConteudo  — Fórmula matemática principal
 *
 * O Pepper lê o texto de explicação em voz alta ao entrar na tela.
 */
function irParaConteudo() {
  const { nivel, forma } = estado;
  const c = dados[nivel][forma]; /* Atalho para o conteúdo da sessão */

  document.getElementById("tituloConteudo").textContent = labelForma[forma];
  document.getElementById("svgFormaConteudo").innerHTML =
    svgFormas[forma] ?? "";
  document.getElementById("textoConteudo").textContent = c.explicacao.texto;
  document.getElementById("formulaConteudo").textContent = c.formula;

  pepper("conteudo_visto", forma + "_" + nivel);
  pepperFalar(c.explicacao.texto);
  navigate("telaConteudo");
}

/* ── IR PARA PERGUNTA ────────────────────────── */

/**
 * Sorteia uma pergunta aleatória do banco e exibe a tela de quiz.
 *
 * Lógica de sorteio:
 *   - Coleta todos os IDs de perguntas disponíveis para nível+forma.
 *   - Sorteia um ID aleatório (sem excluir a pergunta anterior).
 *
 * Monta as alternativas dinamicamente:
 *   - Cria um <button class="q-alt"> para cada resposta.
 *   - Aplica delay escalonado de animação (0,06s + 0,08s × índice).
 *   - Associa checkAnswer() ao onClick de cada botão.
 *
 * O Pepper lê a pergunta e todas as alternativas em voz alta.
 */
function irParaPergunta() {
  const { nivel, forma } = estado;
  const perguntas = dados[nivel][forma].perguntas;

  /* Sorteio aleatório de pergunta */
  const ids = Object.keys(perguntas);
  const idSorteado = ids[Math.floor(Math.random() * ids.length)];
  estado.perguntaId = idSorteado;

  const p = perguntas[idSorteado];
  const letras = ["A", "B", "C", "D"]; /* Rótulos visuais das alternativas */

  document.getElementById("textoPergunta").textContent = p.texto;

  /* Reconstrói a lista de alternativas do zero a cada chamada */
  const lista = document.getElementById("listaAlternativas");
  lista.innerHTML = "";
  Object.entries(p.respostas).forEach(([letra, texto], i) => {
    const btn = document.createElement("button");
    btn.className = "q-alt";
    btn.style.animationDelay = 0.06 + i * 0.08 + "s";
    btn.innerHTML = `<span class="q-letter">${letras[i]}</span><span>${texto}</span>`;
    btn.onclick = () => checkAnswer(btn, letra === p.correta, letra, p);
    lista.appendChild(btn);
  });

  pepper("pergunta_iniciada", forma + "_" + nivel + "_" + idSorteado);
  pepperFalar(
    `Aqui vai a pergunta! ${p.texto}. As alternativas são: ` +
      Object.values(p.respostas)
        .map((t, i) => `${letras[i]}: ${t}`)
        .join(". "),
  );
  navigate("telaPergunta");
}

/* ── VERIFICAR RESPOSTA ──────────────────────── */

/**
 * Processa a alternativa escolhida pelo aluno.
 *
 * Fluxo ao acertar:
 *   1. Marca o botão como correto (classe "correct").
 *   2. Notifica o backend via POST /acerto.
 *   3. Reseta tentativas e navega para a tela de sucesso.
 *
 * Fluxo ao errar (até 3 tentativas):
 *   Tentativa 1 → dica leve  (dicas["1"])
 *   Tentativa 2 → dica mais fácil (dicas["2"])
 *   Tentativa 3 → revela resposta correta + gabarito explicado
 *
 *   Cada erro envia POST /erro com { tentativa, dica } para o backend
 *   (o Pepper fala a dica correspondente).
 *
 * Após 800ms (para a animação de feedback ser visível), navega para
 * "erroExplicacao" ou "sucesso" e restaura os botões ao estado inicial.
 *
 * @param {HTMLButtonElement} el        - Botão clicado pelo aluno
 * @param {boolean}           isCorrect - true se a alternativa é a correta
 * @param {string}            letra     - Chave da alternativa (ex.: "A")
 * @param {Object}            pergunta  - Objeto completo da pergunta do JSON
 */
function checkAnswer(el, isCorrect, letra, pergunta) {
  /* Desabilita todos os botões imediatamente para evitar cliques duplos */
  const alts = document.querySelectorAll(".q-alt");
  alts.forEach((a) => (a.style.pointerEvents = "none"));

  /* Destaca o botão escolhido e esmaece os demais */
  el.classList.add(isCorrect ? "correct" : "wrong");
  alts.forEach((a) => {
    if (a !== el) a.classList.add("dimmed");
  });

  pepper("resposta_escolhida", letra.toUpperCase());

  setTimeout(() => {
    const { nivel, forma } = estado;

    if (isCorrect) {
      /* ── ACERTO ── */
      fetch("/acerto", { method: "POST" });
      estado.tentativas = 0;

      /* Preenche a tela de sucesso com a fórmula da forma estudada */
      document.getElementById("nomeFormaSucesso").textContent =
        labelForma[forma];
      document.getElementById("formulaSucesso").textContent =
        dados[nivel][forma].formula;

      pepper("acerto", forma + "_" + nivel);
      navigate("sucesso");

    } else {
      /* ── ERRO ── */
      estado.tentativas++;
      const { tentativas } = estado;
      const dicas = pergunta.dicas;

      /**
       * Configuração de feedback por tentativa:
       *   tentativa 1 → dica 1 + botão "tentar novamente"
       *   tentativa 2 → dica 2 + botão "tentar novamente"
       *   tentativa 3 → resposta correta + apenas botão "ver resposta"
       */
      const cfg = {
        1: {
          titulo: "Quase lá! 💡",
          subtitulo: "Uma dica para te ajudar:",
          dica: dicas["1"],
          btnTentar: true,
        },
        2: {
          titulo: "Não desista! 🤔",
          subtitulo: "Olha essa dica mais fácil:",
          dica: dicas["2"],
          btnTentar: true,
        },
        3: {
          titulo: "Resposta completa 📖",
          subtitulo: "A resposta correta é:",
          dica: pergunta.respostas[pergunta.correta],
          btnTentar: false,
        },
      };
      /* Fallback seguro: se tentativas > 3, usa configuração da tentativa 3 */
      const t = cfg[tentativas] ?? cfg[3];

      /* Popula a tela de erro/explicação */
      document.getElementById("tituloErro").textContent = t.titulo;
      document.getElementById("subtituloErro").textContent = t.subtitulo;
      document.getElementById("formulaErro").textContent = t.dica;
      /* Gabarito completo só é exibido na 3ª tentativa */
      document.getElementById("textoErro").textContent =
        tentativas >= 3 ? dicas["gabarito"] : "";
      /* Alterna a visibilidade dos botões de ação conforme a tentativa */
      document.getElementById("btnTentarNovamente").style.display = t.btnTentar
        ? "block"
        : "none";
      document.getElementById("btnVerResposta").style.display = t.btnTentar
        ? "none"
        : "block";

      /* Na 3ª tentativa, o Pepper fala a resposta correta + gabarito */
      const dicaFalar =
        tentativas >= 3 ? t.dica + ". " + dicas["gabarito"] : t.dica;

      pepper(`erro_tentativa_${tentativas}`, forma + "_" + nivel);
      fetch("/erro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tentativa: tentativas, dica: dicaFalar }),
      });

      navigate("erroExplicacao");
    }

    /* Restaura os botões para o estado neutro (prontos para nova tentativa) */
    alts.forEach((a) => {
      a.style.pointerEvents = "";
      a.classList.remove("correct", "wrong", "dimmed");
    });
  }, 800); /* Delay para o aluno ver o feedback visual antes da transição */
}

/* ── VOLTAR AGUARDANDO ───────────────────────── */

/**
 * Encerra a sessão atual e retorna à tela de espera por novo cartão.
 * Notifica o backend via POST /aguardando para que o Pepper assuma
 * postura de espera (animação idle, etc.).
 */
function voltarAguardando() {
  estado.tentativas = 0;
  navigate("aguardando");
  fetch("/aguardando", { method: "POST" });
}

/* ── LOADING INICIAL ─────────────────────────── */

/**
 * IIFE de inicialização: anima a barra de progresso da tela de loading
 * e navega para "aguardando" ao atingir 100%.
 *
 * Mecanismo:
 *   - Intervalo de 40ms → aprox. 3 segundos para completar 100%.
 *   - `msgs` define marcos de progresso com mensagens contextuais.
 *   - Ao chegar em 100%: emite evento "sistema_pronto" para o Pepper,
 *     aguarda 400ms e navega para a tela de espera.
 *
 * Elementos manipulados:
 *   #loadFill  — Barra de progresso (largura em %)
 *   #loadLabel — Texto de status atual
 */
(function () {
  const fill = document.getElementById("loadFill");
  const label = document.getElementById("loadLabel");

  /* Marcos de progresso: { at: % mínimo para exibir, t: mensagem } */
  const msgs = [
    { at: 0,  t: "Inicializando..." },
    { at: 30, t: "Conectando ao Pepper..." },
    { at: 65, t: "Carregando conteúdo..." },
    { at: 90, t: "Pronto!" },
  ];

  let prog = 0;

  const timer = setInterval(() => {
    /* Incremento calculado para ~3 segundos totais com tick de 40ms */
    prog = Math.min(prog + (40 / 3000) * 100, 100);
    fill.style.width = prog + "%";

    /* Exibe a mensagem do marco mais recente atingido */
    label.textContent = msgs.filter((x) => x.at <= prog).pop().t;

    if (prog >= 100) {
      clearInterval(timer);
      pepper("sistema_pronto");
      setTimeout(() => {
        navigate("aguardando");
        fetch("/aguardando", { method: "POST" });
      }, 400);
    }
  }, 40);
})();