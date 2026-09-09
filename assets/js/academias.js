/*
  academias.js — lógica das páginas de listagem de academias por cidade.
  Depende de academias-data.js (ACADEMIAS_POR_CIDADE) e site.js já
  carregados antes.

  Cada página de cidade precisa ter:
  <body data-cidade="montes-claros">
  ...e um elemento <section id="listaAcademias">.
*/

const DIAS_SEMANA = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

let academiasDaCidade = [];
let academiaEmExibicao = [];

document.addEventListener("DOMContentLoaded", () => {
  const cidadeSlug = document.body.dataset.cidade;
  academiasDaCidade = ACADEMIAS_POR_CIDADE[cidadeSlug] || [];
  academiaEmExibicao = academiasDaCidade.slice();

  renderizarLista(academiaEmExibicao);

  // Recalcula o status "aberta/fechada" a cada minuto, sem precisar
  // recarregar a página — assim, se alguém deixar a aba aberta bem
  // no horário de fechar, o badge atualiza sozinho.
  setInterval(() => renderizarLista(academiaEmExibicao), 60000);
});

/* =====================================================
   NORMALIZA O HORÁRIO DE UM DIA EM UMA LISTA DE PERÍODOS,
   ORDENADA DO MAIS CEDO PARA O MAIS TARDE.

   Aceita tanto o formato antigo — um único objeto
   { abre, fecha } — quanto o novo, com vários períodos no
   mesmo dia: [{ abre, fecha }, { abre, fecha }]. Isso é o
   que permite academias como a Fox Trainer, que fecham pro
   almoço no sábado e reabrem à tarde.
===================================================== */
function obterPeriodos(horarioDia) {
  if (!horarioDia) return [];
  const periodos = Array.isArray(horarioDia) ? horarioDia : [horarioDia];
  return periodos.slice().sort((a, b) => a.abre.localeCompare(b.abre));
}

/* =====================================================
   CALCULA SE ESTÁ ABERTA AGORA, COM BASE NO HORÁRIO
   INFORMADO PELA PRÓPRIA ACADEMIA (sem imprevistos)
===================================================== */
function calcularStatus(horarios) {
  const agora = new Date();
  const diaSemana = agora.getDay();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const periodosHoje = obterPeriodos(horarios[diaSemana]);

  for (const periodo of periodosHoje) {
    const [horaAbre, minAbre] = periodo.abre.split(":").map(Number);
    const [horaFecha, minFecha] = periodo.fecha.split(":").map(Number);
    const minutosAbre = horaAbre * 60 + minAbre;
    const minutosFecha = horaFecha * 60 + minFecha;

    if (minutosAgora >= minutosAbre && minutosAgora < minutosFecha) {
      return { aberta: true, texto: `Aberta até ${periodo.fecha}` };
    }
  }

  const proximoPeriodoHoje = periodosHoje.find((periodo) => {
    const [horaAbre, minAbre] = periodo.abre.split(":").map(Number);
    return minutosAgora < horaAbre * 60 + minAbre;
  });

  if (proximoPeriodoHoje) {
    return { aberta: false, texto: `Abre hoje às ${proximoPeriodoHoje.abre}` };
  }

  // Fechada agora — procura a próxima abertura nos próximos 7 dias
  for (let i = 1; i <= 7; i++) {
    const proximoDia = (diaSemana + i) % 7;
    const periodosProximoDia = obterPeriodos(horarios[proximoDia]);
    if (periodosProximoDia.length > 0) {
      const rotulo = i === 1 ? "amanhã" : DIAS_SEMANA[proximoDia];
      return { aberta: false, texto: `Fechada · abre ${rotulo} às ${periodosProximoDia[0].abre}` };
    }
  }

  return { aberta: false, texto: "Fechada" };
}

function horarioDeHojeTexto(horarios) {
  const periodosHoje = obterPeriodos(horarios[new Date().getDay()]);
  if (periodosHoje.length === 0) return "Fechada hoje";
  return periodosHoje.map((p) => `${p.abre} às ${p.fecha}`).join(" e ");
}

/* =====================================================
   RENDERIZA OS CARDS
===================================================== */
function renderizarLista(lista) {
  const container = document.getElementById("listaAcademias");
  if (!container) return;

  const semResultado = document.getElementById("semResultado");

  container.querySelectorAll(".academia").forEach((el) => el.remove());

  lista.forEach((academia) => {
    const status = calcularStatus(academia.horarios);

    const card = document.createElement("article");
    card.className = "academia";
    card.dataset.rating = academia.avaliacao;
    card.dataset.open = status.aberta ? "true" : "false";
    card.dataset.name = academia.nome;

    card.innerHTML = `
      <div class="fotoAcademia">
        <img src="${academia.foto}" alt="${academia.nome}">
        <span class="status ${status.aberta ? "" : "fechada"}">${status.texto}</span>
        <button class="coracao" onclick="favoritar(this)">♡</button>
        <span class="notaFoto">⭐ ${academia.avaliacao.toFixed(1).replace(".", ",")}</span>
      </div>
      <div class="academiaConteudo">
        <h3>${academia.nome}</h3>
        <div class="local">
          <strong>📍</strong> ${academia.bairro} · <strong>${academia.distancia}</strong>
        </div>
        <div class="modalidades">
          ${academia.modalidades.map((m) => `<span class="tag">${m}</span>`).join("")}
        </div>
        <div class="horario">
          🕐 Hoje: <strong>${horarioDeHojeTexto(academia.horarios)}</strong>
        </div>
        <div class="cardBottom">
          <a class="primaryBtn" href="${academia.detalhesUrl}">Ver detalhes</a>
          <a class="secondaryBtn" href="${academia.mapsUrl}" target="_blank">📍 Localização</a>
        </div>
      </div>
    `;

    container.insertBefore(card, semResultado);
  });

  atualizarContador(lista.length);
  if (semResultado) semResultado.style.display = lista.length === 0 ? "block" : "none";
}

/* =====================================================
   BUSCA / FILTROS / ORDENAÇÃO
===================================================== */
function buscarAcademia() {
  const texto = document.getElementById("campoBusca").value.toLowerCase().trim();
  const filtradas = academiasDaCidade.filter((a) =>
    a.nome.toLowerCase().includes(texto) ||
    a.bairro.toLowerCase().includes(texto) ||
    a.modalidades.some((m) => m.toLowerCase().includes(texto))
  );
  academiaEmExibicao = filtradas;
  renderizarLista(filtradas);
}

function mostrarTodas(botao) {
  ativarFiltro(botao);
  document.getElementById("campoBusca").value = "";
  academiaEmExibicao = academiasDaCidade.slice();
  renderizarLista(academiaEmExibicao);
}

function filtrarAvaliadas(botao) {
  ativarFiltro(botao);
  academiaEmExibicao = academiasDaCidade.filter((a) => a.avaliacao >= 4.5);
  renderizarLista(academiaEmExibicao);
}

function filtrarAbertas(botao) {
  ativarFiltro(botao);
  academiaEmExibicao = academiasDaCidade.filter((a) => calcularStatus(a.horarios).aberta);
  renderizarLista(academiaEmExibicao);
}

function ativarFiltro(botao) {
  document.querySelectorAll(".filtro").forEach((f) => f.classList.remove("ativo"));
  botao.classList.add("ativo");
}

function ordenarAcademias() {
  const tipo = document.getElementById("ordenar").value;
  const lista = academiaEmExibicao.slice();

  if (tipo === "rating") lista.sort((a, b) => b.avaliacao - a.avaliacao);
  if (tipo === "nome") lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  academiaEmExibicao = lista;
  renderizarLista(lista);
}

function atualizarContador(quantidade) {
  const contador = document.getElementById("contador");
  if (!contador) return;
  contador.innerText = quantidade === 1 ? "1 academia encontrada" : `${quantidade} academias encontradas`;
}

function favoritar(botao) {
  const favoritado = botao.innerText === "♥";
  botao.innerText = favoritado ? "♡" : "♥";
  botao.style.color = favoritado ? "#fff" : "var(--yellow)";
}
