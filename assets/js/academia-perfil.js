/*
  academia-perfil.js — lógica da página de perfil único de uma
  academia (academia.html). A mesma página serve pra QUALQUER
  academia: ela lê o "id" na URL (ex: academia.html?id=2), busca
  os dados no Supabase e monta a página automaticamente.

  Depende de site.js já carregado antes (pro menu/dropdown de
  cidade funcionar igual nas outras páginas).
*/

const SUPABASE_URL = "https://bsihmwcnixszgiaovbnf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lNPnVij18jTBa1R8QG_TAA_eCizvL9F";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DIAS_SEMANA = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

const NOMES_ESTRUTURA = {
  estacionamento: "Estacionamento",
  piscina: "Piscina",
  vestiario: "Vestiário",
  chuveiro: "Chuveiro",
  ar_condicionado: "Ar-condicionado",
  cardio: "Área de cardio",
  musculacao: "Área de musculação",
  wifi: "Wi-Fi"
};

let academiaIdAtual = null;

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    mostrarErro("Academia não encontrada. Volte e tente de novo.");
    return;
  }

  academiaIdAtual = id;

  const { data: academia, error } = await supabaseClient
    .from("academias")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !academia) {
    mostrarErro("Não foi possível carregar essa academia agora.");
    return;
  }

  renderizarPerfil(academia);
  configurarFormularioAvaliacao(id);
  carregarAvaliacoes(id);
});

function mostrarErro(mensagem) {
  document.getElementById("perfilConteudo").innerHTML = `<p class="semResultado"><strong>${mensagem}</strong></p>`;
}

/* =====================================================
   HORÁRIOS (mesma lógica usada na listagem, em academias.js)
===================================================== */
function obterPeriodos(horarioDia) {
  if (!horarioDia) return [];
  const periodos = Array.isArray(horarioDia) ? horarioDia : [horarioDia];
  return periodos.slice().sort((a, b) => a.abre.localeCompare(b.abre));
}

function calcularStatus(horarios) {
  const agora = new Date();
  const diaSemana = agora.getDay();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const periodosHoje = obterPeriodos(horarios ? horarios[diaSemana] : null);

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

  for (let i = 1; i <= 7; i++) {
    const proximoDia = (diaSemana + i) % 7;
    const periodosProximoDia = obterPeriodos(horarios ? horarios[proximoDia] : null);
    if (periodosProximoDia.length > 0) {
      const rotulo = i === 1 ? "amanhã" : DIAS_SEMANA[proximoDia];
      return { aberta: false, texto: `Fechada · abre ${rotulo} às ${periodosProximoDia[0].abre}` };
    }
  }

  return { aberta: false, texto: "Fechada" };
}

/* =====================================================
   RENDERIZA A PÁGINA INTEIRA A PARTIR DOS DADOS
===================================================== */
function renderizarPerfil(academia) {
  document.title = `${academia.nome} | BuscaAcademias`;

  document.getElementById("breadcrumbPerfil").innerHTML =
    `<a href="index.html">Início</a> &nbsp;›&nbsp; ${academia.nome}`;

  document.getElementById("nomeAcademia").textContent = academia.nome;
  document.getElementById("enderecoAcademia").textContent =
    academia.endereco || `${academia.bairro || ""}`.trim() || "Endereço não informado";

  const fotoCapa = document.getElementById("fotoCapa");
  fotoCapa.src = academia.foto || "";
  fotoCapa.alt = academia.nome;

  const status = calcularStatus(academia.horarios);
  const statusEl = document.getElementById("statusAcademia");
  statusEl.textContent = status.texto;
  statusEl.classList.toggle("fechada", !status.aberta);

  const nota = Number(academia.avaliacao);
  document.getElementById("notaAcademia").textContent = isNaN(nota) ? "" : `⭐ ${nota.toFixed(1).replace(".", ",")}`;
  document.getElementById("numAvaliacoes").textContent =
    academia.numero_avaliacoes ? `(${academia.numero_avaliacoes} avaliações)` : "";

  document.getElementById("modalidadesAcademia").innerHTML =
    (academia.modalidades || []).map((m) => `<span class="tag">${m}</span>`).join("");

  const selos = [];
  if (academia.aceita_wellhub) {
    selos.push('<img class="planoLogo" src="assets/img/wellhub-logo.png" alt="Aceita Wellhub" title="Aceita Wellhub">');
  }
  if (academia.aceita_totalpass) {
    selos.push('<img class="planoLogo" src="assets/img/totalpass-logo.png" alt="Aceita TotalPass" title="Aceita TotalPass">');
  }
  document.getElementById("planosAcademia").innerHTML = selos.join("");

  // Botões de ação
  const btnMapa = document.getElementById("btnMapa");
  btnMapa.href = academia.maps_url || "#";

  const btnWhatsapp = document.getElementById("btnWhatsapp");
  if (academia.whatsapp) {
    btnWhatsapp.href = `https://wa.me/${academia.whatsapp}`;
    btnWhatsapp.style.display = "inline-flex";
  }

  const btnInstagram = document.getElementById("btnInstagram");
  if (academia.instagram) {
    const usuario = academia.instagram.replace("@", "");
    btnInstagram.href = `https://instagram.com/${usuario}`;
    btnInstagram.style.display = "inline-flex";
  }

  const btnSite = document.getElementById("btnSite");
  if (academia.site) {
    btnSite.href = academia.site;
    btnSite.style.display = "inline-flex";
  }

  // Horários (todos os dias da semana)
  document.getElementById("horariosAcademia").innerHTML = DIAS_SEMANA.map((dia, i) => {
    const periodos = obterPeriodos(academia.horarios ? academia.horarios[i] : null);
    const texto = periodos.length ? periodos.map((p) => `${p.abre} às ${p.fecha}`).join(" e ") : "Fechado";
    return `<li><strong>${dia}:</strong> ${texto}</li>`;
  }).join("");

  // Preços
  const precos = academia.precos || {};
  const itensPreco = [];
  if (precos.mensalidade) itensPreco.push(`<li>Mensalidade: <strong>R$ ${precos.mensalidade}</strong></li>`);
  if (precos.matricula) itensPreco.push(`<li>Matrícula: <strong>R$ ${precos.matricula}</strong></li>`);
  document.getElementById("precosAcademia").innerHTML =
    itensPreco.length ? itensPreco.join("") : "<li>Preço não informado — entre em contato</li>";

  // Estrutura
  const estrutura = academia.estrutura || {};
  const itensEstrutura = Object.entries(estrutura)
    .filter(([, temItem]) => temItem)
    .map(([chave]) => `<li>✅ ${NOMES_ESTRUTURA[chave] || chave}</li>`);
  document.getElementById("estruturaAcademia").innerHTML =
    itensEstrutura.length ? itensEstrutura.join("") : "<li>Estrutura ainda não informada</li>";

  // Galeria de fotos extras
  const galeriaEl = document.getElementById("galeriaAcademia");
  const fotosExtras = academia.fotos || [];
  if (fotosExtras.length > 0) {
    galeriaEl.innerHTML = fotosExtras.map((f) => `<img src="${f}" alt="${academia.nome}">`).join("");
  } else {
    document.getElementById("secaoGaleria").style.display = "none";
  }
}


/* =====================================================
   AVALIAÇÕES (estrelas + comentário)
===================================================== */
function configurarFormularioAvaliacao(academiaId) {
  const jaAvaliou = localStorage.getItem(`avaliou_academia_${academiaId}`);
  if (jaAvaliou) {
    document.getElementById("blocoFormularioAvaliacao").innerHTML =
      "<h2>Você já avaliou essa academia. Obrigado! 🙌</h2>";
    return;
  }

  document.getElementById("btnEnviarAvaliacao").addEventListener("click", () => {
    enviarAvaliacao(academiaId);
  });
}

async function enviarAvaliacao(academiaId) {
  const feedbackEl = document.getElementById("feedbackAvaliacao");
  const radioSelecionado = document.querySelector('input[name="nota"]:checked');

  if (!radioSelecionado) {
    feedbackEl.textContent = "Escolha de 1 a 5 estrelas antes de enviar.";
    return;
  }

  const nota = Number(radioSelecionado.value);
  const comentario = document.getElementById("comentarioAvaliacao").value.trim();
  const botao = document.getElementById("btnEnviarAvaliacao");
  botao.disabled = true;
  feedbackEl.textContent = "Enviando...";

  const { error } = await supabaseClient.from("avaliacoes").insert({
    academia_id: academiaId,
    nota: nota,
    comentario: comentario || null
  });

  if (error) {
    feedbackEl.textContent = "Não foi possível enviar sua avaliação. Tenta de novo em instantes.";
    botao.disabled = false;
    return;
  }

  localStorage.setItem(`avaliou_academia_${academiaId}`, "true");
  document.getElementById("blocoFormularioAvaliacao").innerHTML =
    "<h2>Valeu pela avaliação! 🙌</h2>";

  // Recarrega os dados da academia pra já mostrar a nota atualizada
  const { data: academiaAtualizada } = await supabaseClient
    .from("academias")
    .select("*")
    .eq("id", academiaId)
    .single();

  if (academiaAtualizada) renderizarPerfil(academiaAtualizada);
  carregarAvaliacoes(academiaId);
}

async function carregarAvaliacoes(academiaId) {
  const { data: avaliacoes, error } = await supabaseClient
    .from("avaliacoes")
    .select("nota, comentario, criado_em")
    .eq("academia_id", academiaId)
    .order("criado_em", { ascending: false });

  const listaEl = document.getElementById("listaAvaliacoes");
  if (!listaEl) return;

  if (error || !avaliacoes || avaliacoes.length === 0) {
    listaEl.innerHTML = "<p>Ainda não tem avaliações. Seja o primeiro!</p>";
    return;
  }

  listaEl.innerHTML = avaliacoes.map((av) => `
    <div class="avaliacaoItem">
      <div class="avaliacaoEstrelas">${"★".repeat(av.nota)}${"☆".repeat(5 - av.nota)}</div>
      ${av.comentario ? `<p>${av.comentario}</p>` : ""}
    </div>
  `).join("");
}
