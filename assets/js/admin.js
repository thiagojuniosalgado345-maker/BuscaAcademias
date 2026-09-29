/*
  admin.js — painel de administração do BuscaAcademias (admin.html).

  O que faz:
  - Login (só quem tem conta criada no Supabase entra)
  - Lista todas as academias, mostrando o que ainda falta preencher
  - Criar, editar e excluir academias
  - Enviar fotos direto pro Supabase (reduzindo o tamanho antes)
  - Arruma sozinho WhatsApp, Instagram, site e coordenadas coladas

  A segurança de verdade está no banco (regras RLS do admin-setup.sql):
  mesmo que alguém abra esta página, sem estar logado não consegue
  gravar nada.
*/

const SUPABASE_URL = "https://bsihmwcnixszgiaovbnf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lNPnVij18jTBa1R8QG_TAA_eCizvL9F";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET_FOTOS = "fotos-academias";
const MAX_FOTOS_GALERIA = 12;

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ORDEM_DIAS_NA_TELA = [1, 2, 3, 4, 5, 6, 0]; // Segunda → Domingo

const OPCOES_ESTRUTURA = [
  ["estacionamento", "Estacionamento"],
  ["piscina", "Piscina"],
  ["vestiario", "Vestiário"],
  ["chuveiro", "Chuveiro"],
  ["ar_condicionado", "Ar-condicionado"],
  ["cardio", "Área de cardio"],
  ["musculacao", "Área de musculação"],
  ["wifi", "Wi-Fi"]
];

const FOTO_VAZIA = "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 72'><rect width='96' height='72' fill='#0F274C'/>" +
  "<g fill='none' stroke='#2C4A78' stroke-width='4' stroke-linecap='round'><path d='M32 36h32'/><path d='M27 26v20M21 29v14M69 26v20M75 29v14'/></g></svg>"
);

let todasAcademias = [];
let editando = null;          // academia sendo editada (null = criando uma nova)
let salvando = false;
let formSujo = false;         // true se mexeu em algo (pra avisar antes de descartar)
let capaAtualUrl = null;      // foto principal que já está salva
let capaNovaArquivo = null;   // foto principal escolhida agora (ainda não enviada)
let galeriaUrls = [];         // fotos da galeria já salvas
let galeriaNovosArquivos = []; // fotos da galeria escolhidas agora
let urlsTemporarias = [];     // pré-visualizações locais (pra liberar memória depois)

const $ = (id) => document.getElementById(id);

/* =====================================================
   FUNÇÕES AUXILIARES (texto, números, coordenadas...)
===================================================== */
function escaparHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function slugify(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "academia";
}

function slugDaCidade(cidade) {
  return String(cidade.arquivo || "").replace(/\.html$/i, "");
}

// "(38) 99904-2432" -> "5538999042432" (formato que o link do WhatsApp exige)
function normalizarWhatsapp(valor) {
  let numeros = String(valor || "").replace(/\D/g, "");
  if (!numeros) return "";
  if (numeros.length === 10 || numeros.length === 11) numeros = "55" + numeros;
  return numeros;
}

// "https://instagram.com/foxtrainner/?hl=pt" | "foxtrainner" -> "@foxtrainner"
function normalizarInstagram(valor) {
  let v = String(valor || "").trim();
  if (!v) return "";
  v = v.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "");
  v = v.replace(/[?#].*$/, "").replace(/\/.*$/, "").replace(/^@/, "");
  return v ? "@" + v : "";
}

function normalizarSite(valor) {
  const v = String(valor || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : "https://" + v;
}

// Vazio -> null | inválido -> NaN | "89,90" -> 89.9 | "-16.73" -> -16.73
function lerDecimal(texto) {
  let t = String(texto ?? "").trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// Aceita: "-16.73, -43.84"  |  link completo do Google Maps
function extrairCoordenadas(texto) {
  const t = String(texto || "").trim();
  if (!t) return null;

  // 1) Pino exato dentro de links do Google Maps: !3d<lat>!4d<lng>
  let m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  // 2) Centro do mapa no link: @<lat>,<lng>
  if (!m) m = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  // 3) "lat, lng" solto (o que o Google Maps copia ao clicar com o botão direito)
  if (!m) m = t.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;

  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function caminhoNoBucket(url) {
  const marcador = `/storage/v1/object/public/${BUCKET_FOTOS}/`;
  const texto = String(url || "");
  const i = texto.indexOf(marcador);
  if (i === -1) return null;
  return decodeURIComponent(texto.slice(i + marcador.length).split("?")[0]);
}

function triParaSelect(valor) {
  return valor === true ? "sim" : valor === false ? "nao" : "";
}

function selectParaTri(valor) {
  return valor === "sim" ? true : valor === "nao" ? false : null;
}

function temHorario(horarios) {
  return !!horarios && Object.values(horarios).some(Boolean);
}

function mensagemDeErro(erro) {
  const texto = String((erro && erro.message) || erro || "");
  if (/bucket not found/i.test(texto)) {
    return "A pasta de fotos ainda não existe no Supabase. Rode o admin-setup.sql.";
  }
  if ((erro && erro.code === "PGRST116") || /row-level security|permission denied|not authorized|violates/i.test(texto)) {
    return "Sem permissão para salvar. Confirme que você está logado e que rodou o admin-setup.sql no Supabase.";
  }
  if (/failed to fetch|networkerror|name_not_resolved/i.test(texto)) {
    return "Não consegui falar com o Supabase. Verifique a internet — e se o projeto não está pausado no painel do Supabase.";
  }
  return texto || "Erro desconhecido.";
}

function avisar(texto) {
  const el = $("toast");
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisar.timer);
  avisar.timer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* =====================================================
   LOGIN / SAIR
===================================================== */
function mostrarLogin() {
  $("telaPainel").hidden = true;
  $("telaLogin").hidden = false;
}

async function mostrarPainel(usuario) {
  $("telaLogin").hidden = true;
  $("telaPainel").hidden = false;
  $("usuarioLogado").textContent = usuario && usuario.email ? usuario.email : "";
  await carregarLista();
}

async function entrar(evento) {
  evento.preventDefault();
  const botao = $("btnLogin");
  $("loginErro").textContent = "";
  botao.disabled = true;
  botao.textContent = "Entrando...";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginSenha").value
  });

  botao.disabled = false;
  botao.textContent = "Entrar";

  if (error) {
    $("loginErro").textContent = /failed to fetch|network/i.test(error.message)
      ? mensagemDeErro(error)
      : "E-mail ou senha incorretos.";
    return;
  }

  $("loginSenha").value = "";
  await mostrarPainel(data.user);
}

async function sair() {
  await supabaseClient.auth.signOut();
  mostrarLogin();
}

/* =====================================================
   LISTA DE ACADEMIAS
===================================================== */
async function carregarLista() {
  $("resumoLista").textContent = "Carregando...";

  const { data, error } = await supabaseClient
    .from("academias")
    .select("*")
    .order("cidade", { ascending: true })
    .order("nome", { ascending: true });

  if (error) {
    $("resumoLista").textContent = "Erro ao carregar: " + mensagemDeErro(error);
    return;
  }

  todasAcademias = data || [];
  renderizarLista();
}

function pendenciasDaAcademia(a) {
  const p = [];
  if (!a.foto) p.push("sem foto");
  if (a.latitude == null || a.longitude == null) p.push("sem localização");
  if (!temHorario(a.horarios)) p.push("sem horários");
  if (!a.whatsapp) p.push("sem WhatsApp");
  if (!a.endereco) p.push("sem endereço");
  if (!a.precos || !a.precos.mensalidade) p.push("sem preço");
  if (a.avaliacao != null && !a.numero_avaliacoes) p.push("nota de exemplo (sem avaliações reais)");
  return p;
}

function nomeDaCidade(slug) {
  if (typeof CIDADES !== "undefined") {
    const achada = CIDADES.find((c) => slugDaCidade(c) === slug);
    if (achada) return achada.nome;
  }
  return slug;
}

function renderizarLista() {
  const termo = $("filtroLista").value.trim().toLowerCase();
  const filtradas = todasAcademias.filter((a) =>
    !termo ||
    `${a.nome} ${a.bairro || ""} ${nomeDaCidade(a.cidade)}`.toLowerCase().includes(termo)
  );

  const comPendencias = todasAcademias.filter((a) => pendenciasDaAcademia(a).length > 0).length;
  $("resumoLista").textContent = todasAcademias.length
    ? `${todasAcademias.length} academia(s) cadastrada(s) · ${comPendencias} com informações faltando`
    : "Nenhuma academia encontrada. Se você esperava ver as suas, confirme que rodou o admin-setup.sql.";

  if (filtradas.length === 0) {
    $("listaAdmin").innerHTML = `<p class="vazio">${todasAcademias.length ? "Nada encontrado para essa busca." : "Clique em “Nova academia” para começar."}</p>`;
    return;
  }

  $("listaAdmin").innerHTML = filtradas.map((a) => {
    const pendencias = pendenciasDaAcademia(a);
    const chips = pendencias.length
      ? pendencias.map((p) => `<span class="chip">${escaparHtml(p)}</span>`).join("")
      : `<span class="chip completo">✓ cadastro completo</span>`;
    const nota = a.avaliacao != null && a.numero_avaliacoes
      ? ` · ⭐ ${Number(a.avaliacao).toFixed(1).replace(".", ",")} (${a.numero_avaliacoes})`
      : "";

    return `
      <article class="linha">
        <img class="miniatura" src="${escaparHtml(a.foto || FOTO_VAZIA)}" alt="" loading="lazy">
        <div class="linhaInfo">
          <strong>${escaparHtml(a.nome)}</strong>
          <span class="meta">${escaparHtml(nomeDaCidade(a.cidade))}${a.bairro ? " · " + escaparHtml(a.bairro) : ""}${nota}</span>
          <div class="chips">${chips}</div>
        </div>
        <div class="linhaAcoes">
          <a class="btn btnSecundario btnPequeno" href="academia.html?id=${a.id}" target="_blank">Ver página</a>
          <button type="button" class="btn btnSecundario btnPequeno" data-acao="editar" data-id="${a.id}">Editar</button>
          <button type="button" class="btn btnPerigo btnPequeno" data-acao="excluir" data-id="${a.id}">Excluir</button>
        </div>
      </article>`;
  }).join("");
}

async function excluirAcademia(id) {
  const academia = todasAcademias.find((a) => a.id === id);
  if (!academia) return;

  const confirmou = confirm(
    `Excluir "${academia.nome}"?\n\nIsso também apaga as avaliações dela e NÃO dá pra desfazer.`
  );
  if (!confirmou) return;

  const { data, error } = await supabaseClient.from("academias").delete().eq("id", id).select();

  if (error || !data || data.length === 0) {
    avisar("Não foi possível excluir: " + mensagemDeErro(error || { code: "PGRST116" }));
    return;
  }

  await removerFotosDoBucket([academia.foto, ...(academia.fotos || [])]);
  avisar("Academia excluída.");
  await carregarLista();
}

/* =====================================================
   FORMULÁRIO — montagem
===================================================== */
function montarGridHorarios() {
  const cabecalho = `
    <div class="hCab">Dia</div><div class="hCab">Abre</div><div class="hCab">Fecha</div>
    <div class="hCab">Reabre</div><div class="hCab">Fecha</div>`;

  const linhas = ORDEM_DIAS_NA_TELA.map((i) => `
    <div class="hDia">${DIAS_SEMANA[i]}</div>
    <input type="time" id="h_${i}_a1" aria-label="${DIAS_SEMANA[i]}: abre">
    <input type="time" id="h_${i}_f1" aria-label="${DIAS_SEMANA[i]}: fecha">
    <input type="time" id="h_${i}_a2" aria-label="${DIAS_SEMANA[i]}: reabre (2º período)">
    <input type="time" id="h_${i}_f2" aria-label="${DIAS_SEMANA[i]}: fecha (2º período)">`).join("");

  $("gridHorarios").innerHTML = cabecalho + linhas;
}

function montarGridEstrutura() {
  $("gridEstrutura").innerHTML = OPCOES_ESTRUTURA.map(([chave, rotulo]) => `
    <label class="opcaoEstrutura">
      <input type="checkbox" id="e_${chave}">
      <span>${rotulo}</span>
    </label>`).join("");
}

function preencherSelectCidade(valorAtual) {
  const select = $("f_cidade");
  const slugs = [];
  select.innerHTML = "";
  select.add(new Option("Selecione a cidade", ""));

  if (typeof CIDADES !== "undefined") {
    CIDADES.forEach((cidade) => {
      const slug = slugDaCidade(cidade);
      slugs.push(slug);
      select.add(new Option(`${cidade.nome} - ${cidade.uf}`, slug));
    });
  }

  // Se a academia tem uma cidade que não está na lista, não perde a informação
  if (valorAtual && !slugs.includes(valorAtual)) select.add(new Option(valorAtual, valorAtual));

  select.value = valorAtual || (slugs.includes("montes-claros") ? "montes-claros" : "");
}

function preencherHorarios(horarios) {
  for (let i = 0; i < 7; i++) {
    const dia = horarios ? horarios[i] : null;
    const periodos = !dia ? [] : Array.isArray(dia) ? dia : [dia];
    $(`h_${i}_a1`).value = periodos[0] ? periodos[0].abre : "";
    $(`h_${i}_f1`).value = periodos[0] ? periodos[0].fecha : "";
    $(`h_${i}_a2`).value = periodos[1] ? periodos[1].abre : "";
    $(`h_${i}_f2`).value = periodos[1] ? periodos[1].fecha : "";
  }
}

function preencherEstrutura(estrutura) {
  OPCOES_ESTRUTURA.forEach(([chave]) => {
    $(`e_${chave}`).checked = !!(estrutura && estrutura[chave]);
  });
}

function copiarSegundaParaSemana() {
  ["a1", "f1", "a2", "f2"].forEach((campo) => {
    const valor = $(`h_1_${campo}`).value;
    for (let i = 2; i <= 5; i++) $(`h_${i}_${campo}`).value = valor;
  });
  formSujo = true;
}

function limparHorarios() {
  preencherHorarios(null);
  formSujo = true;
}

/* =====================================================
   FORMULÁRIO — abrir / fechar
===================================================== */
function abrirFormulario(academia) {
  editando = academia || null;
  const a = academia || {};

  $("tituloModal").textContent = academia ? `Editar: ${academia.nome}` : "Nova academia";
  $("formMsg").textContent = "";
  $("formMsg").className = "formMsg";
  $("coordenadasResultado").textContent = "";

  preencherSelectCidade(a.cidade);
  $("f_nome").value = a.nome || "";
  $("f_bairro").value = a.bairro || "";
  $("f_endereco").value = a.endereco || "";
  $("f_whatsapp").value = a.whatsapp || "";
  $("f_instagram").value = a.instagram || "";
  $("f_site").value = a.site || "";

  $("f_coordenadas").value = "";
  $("f_lat").value = a.latitude != null ? a.latitude : "";
  $("f_lng").value = a.longitude != null ? a.longitude : "";
  $("f_mapsurl").value = a.maps_url && a.maps_url !== "#" ? a.maps_url : "";

  $("f_modalidades").value = (a.modalidades || []).join(", ");
  const precos = a.precos || {};
  $("f_mensalidade").value = precos.mensalidade != null ? precos.mensalidade : "";
  $("f_matricula").value = precos.matricula != null ? precos.matricula : "";

  $("f_wellhub").value = triParaSelect(a.aceita_wellhub);
  $("f_totalpass").value = triParaSelect(a.aceita_totalpass);

  preencherHorarios(a.horarios);
  preencherEstrutura(a.estrutura);

  capaAtualUrl = a.foto || null;
  capaNovaArquivo = null;
  galeriaUrls = (a.fotos || []).slice();
  galeriaNovosArquivos = [];
  $("f_capa").value = "";
  $("f_galeria").value = "";
  renderizarPreviewCapa();
  renderizarPreviewGaleria();

  formSujo = false;
  $("modalFundo").hidden = false;
  document.body.classList.add("modalAberto");
  $("formAcademia").scrollTop = 0;
  $("f_nome").focus();
}

function fecharFormulario(forcar) {
  if (salvando) return;
  if (!forcar && formSujo && !confirm("Descartar as alterações que você fez?")) return;
  $("modalFundo").hidden = true;
  document.body.classList.remove("modalAberto");
  liberarUrlsTemporarias();
  editando = null;
}

/* =====================================================
   FORMULÁRIO — fotos
===================================================== */
function liberarUrlsTemporarias() {
  urlsTemporarias.forEach((u) => URL.revokeObjectURL(u));
  urlsTemporarias = [];
}

function urlTemporaria(arquivo) {
  const url = URL.createObjectURL(arquivo);
  urlsTemporarias.push(url);
  return url;
}

function renderizarPreviewCapa() {
  const el = $("previewCapa");
  const src = capaNovaArquivo ? urlTemporaria(capaNovaArquivo) : capaAtualUrl;

  if (!src) {
    el.innerHTML = '<span class="semFoto">Nenhuma foto principal ainda.</span>';
    return;
  }

  el.innerHTML = `
    <div class="caixaCapa">
      <img src="${escaparHtml(src)}" alt="Foto principal">
      <button type="button" class="remover" data-acao="remover-capa" aria-label="Remover foto principal">✕</button>
    </div>`;
}

function renderizarPreviewGaleria() {
  const existentes = galeriaUrls.map((url, i) => `
    <div class="miniFoto">
      <img src="${escaparHtml(url)}" alt="Foto da galeria">
      <button type="button" data-acao="remover-galeria" data-tipo="url" data-i="${i}" aria-label="Remover foto">✕</button>
    </div>`);

  const novas = galeriaNovosArquivos.map((arquivo, i) => `
    <div class="miniFoto">
      <img src="${escaparHtml(urlTemporaria(arquivo))}" alt="Nova foto">
      <button type="button" data-acao="remover-galeria" data-tipo="novo" data-i="${i}" aria-label="Remover foto">✕</button>
    </div>`);

  const tudo = existentes.concat(novas);
  $("previewGaleria").innerHTML = tudo.length ? tudo.join("") : '<span class="semFoto">Nenhuma foto extra.</span>';
}

// Reduz a foto (largura máx. 1600px, JPEG) — celulares tiram fotos de vários MB
function comprimirImagem(arquivo, larguraMax = 1600, qualidade = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, larguraMax / img.width);
      const largura = Math.round(img.width * escala);
      const altura = Math.round(img.height * escala);

      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; // PNG transparente vira fundo branco (JPEG não tem transparência)
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(img, 0, 0, largura, altura);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível processar a imagem."))),
        "image/jpeg",
        qualidade
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não consegui ler a imagem "${arquivo.name}". Use JPG, PNG ou WebP.`));
    };

    img.src = url;
  });
}

async function enviarFoto(arquivo, pasta, nomeBase) {
  const blob = await comprimirImagem(arquivo);
  const caminho = `${pasta}/${slugify(nomeBase)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;

  const { error } = await supabaseClient.storage
    .from(BUCKET_FOTOS)
    .upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });

  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET_FOTOS).getPublicUrl(caminho);
  return data.publicUrl;
}

async function removerFotosDoBucket(urls) {
  const caminhos = [...new Set((urls || []).map(caminhoNoBucket).filter(Boolean))];
  if (!caminhos.length) return;
  const { error } = await supabaseClient.storage.from(BUCKET_FOTOS).remove(caminhos);
  if (error) console.warn("Não foi possível limpar fotos antigas:", error);
}

/* =====================================================
   FORMULÁRIO — ler, validar e salvar
===================================================== */
function lerHorarios() {
  const horarios = {};
  const erros = [];

  for (let i = 0; i < 7; i++) {
    const dia = DIAS_SEMANA[i];
    const a1 = $(`h_${i}_a1`).value;
    const f1 = $(`h_${i}_f1`).value;
    const a2 = $(`h_${i}_a2`).value;
    const f2 = $(`h_${i}_f2`).value;
    const periodos = [];

    if (Boolean(a1) !== Boolean(f1)) {
      erros.push(`${dia}: preencha “abre” e “fecha”.`);
    } else if (a1 && f1) {
      if (f1 <= a1) erros.push(`${dia}: o horário de fechar precisa ser depois de abrir (academia 24h: 00:00 às 23:59).`);
      else periodos.push({ abre: a1, fecha: f1 });
    }

    if (Boolean(a2) !== Boolean(f2)) {
      erros.push(`${dia}: preencha “reabre” e “fecha” do 2º período.`);
    } else if (a2 && f2) {
      if (!periodos.length) erros.push(`${dia}: preencha o 1º período antes do 2º.`);
      else if (a2 <= periodos[0].fecha) erros.push(`${dia}: o 2º período precisa começar depois do fim do 1º.`);
      else if (f2 <= a2) erros.push(`${dia}: no 2º período, o fechamento precisa ser depois da abertura.`);
      else periodos.push({ abre: a2, fecha: f2 });
    }

    horarios[i] = periodos.length === 0 ? null : periodos.length === 1 ? periodos[0] : periodos;
  }

  return { horarios, erros };
}

function lerEstrutura() {
  const estrutura = {};
  OPCOES_ESTRUTURA.forEach(([chave]) => {
    if ($(`e_${chave}`).checked) estrutura[chave] = true;
  });
  return estrutura;
}

function lerModalidades() {
  const vistas = new Set();
  return $("f_modalidades").value
    .split(/[,\n;]/)
    .map((m) => m.trim())
    .filter((m) => {
      const chave = m.toLowerCase();
      if (!m || vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    });
}

// Devolve { registro, erros }
function lerFormulario() {
  const erros = [];

  const cidade = $("f_cidade").value;
  const nome = $("f_nome").value.trim();
  if (!cidade) erros.push("Escolha a cidade.");
  if (!nome) erros.push("Preencha o nome da academia.");

  const whatsapp = normalizarWhatsapp($("f_whatsapp").value);
  if (whatsapp && (whatsapp.length < 12 || whatsapp.length > 13)) {
    erros.push("O WhatsApp parece incompleto (precisa de DDD + número).");
  }

  const lat = lerDecimal($("f_lat").value);
  const lng = lerDecimal($("f_lng").value);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    erros.push("Latitude/longitude inválidas — use só números, ex: -16.7351185.");
  } else if ((lat === null) !== (lng === null)) {
    erros.push("Preencha latitude E longitude (ou deixe as duas em branco).");
  } else if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
    erros.push("Latitude/longitude fora do intervalo válido.");
  }

  const mensalidade = lerDecimal($("f_mensalidade").value);
  const matricula = lerDecimal($("f_matricula").value);
  if (Number.isNaN(mensalidade) || (mensalidade !== null && mensalidade < 0)) erros.push("Mensalidade inválida.");
  if (Number.isNaN(matricula) || (matricula !== null && matricula < 0)) erros.push("Matrícula inválida.");

  const { horarios, erros: errosHorarios } = lerHorarios();
  erros.push(...errosHorarios);

  const temCoordenadas = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const mapsInformado = $("f_mapsurl").value.trim();
  const mapsUrl = mapsInformado ||
    (temCoordenadas ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null);

  const precos = {};
  if (mensalidade !== null && !Number.isNaN(mensalidade)) precos.mensalidade = mensalidade;
  if (matricula !== null && !Number.isNaN(matricula)) precos.matricula = matricula;

  const registro = {
    cidade,
    nome,
    bairro: $("f_bairro").value.trim() || null,
    endereco: $("f_endereco").value.trim() || null,
    whatsapp: whatsapp || null,
    instagram: normalizarInstagram($("f_instagram").value) || null,
    site: normalizarSite($("f_site").value) || null,
    latitude: temCoordenadas ? lat : null,
    longitude: temCoordenadas ? lng : null,
    maps_url: mapsUrl,
    modalidades: lerModalidades(),
    precos: Object.keys(precos).length ? precos : null,
    aceita_wellhub: selectParaTri($("f_wellhub").value),
    aceita_totalpass: selectParaTri($("f_totalpass").value),
    horarios, // sempre um objeto com os 7 dias (dia fechado = null) — nunca null, senão a lista do site quebra
    estrutura: lerEstrutura()
  };

  return { registro, erros };
}

function mostrarMensagemForm(texto, tipo) {
  const el = $("formMsg");
  el.textContent = texto;
  el.className = "formMsg" + (tipo ? " " + tipo : "");
}

async function salvarAcademia(evento) {
  evento.preventDefault();
  if (salvando) return;

  const { registro, erros } = lerFormulario();
  if (erros.length) {
    mostrarMensagemForm(erros.join(" "), "erro");
    return;
  }

  salvando = true;
  $("btnSalvar").disabled = true;
  const eraNova = !editando;
  const fotosParaApagar = [];

  try {
    // ----- foto principal -----
    let fotoFinal = capaAtualUrl;
    if (capaNovaArquivo) {
      mostrarMensagemForm("Enviando foto principal...");
      fotoFinal = await enviarFoto(capaNovaArquivo, "capas", registro.nome);
      if (editando && editando.foto) fotosParaApagar.push(editando.foto);
    } else if (!capaAtualUrl && editando && editando.foto) {
      fotosParaApagar.push(editando.foto); // o usuário removeu a foto principal
    }

    // ----- galeria -----
    const galeriaFinal = galeriaUrls.slice();
    for (let i = 0; i < galeriaNovosArquivos.length; i++) {
      mostrarMensagemForm(`Enviando foto ${i + 1} de ${galeriaNovosArquivos.length} da galeria...`);
      galeriaFinal.push(await enviarFoto(galeriaNovosArquivos[i], "galeria", registro.nome));
    }
    if (editando) {
      (editando.fotos || []).forEach((url) => {
        if (!galeriaUrls.includes(url)) fotosParaApagar.push(url);
      });
    }

    registro.foto = fotoFinal || null;
    registro.fotos = galeriaFinal;

    // ----- gravar no banco -----
    mostrarMensagemForm("Salvando...");
    const consulta = editando
      ? supabaseClient.from("academias").update(registro).eq("id", editando.id)
      : supabaseClient.from("academias").insert(registro);
    const { error } = await consulta.select().single();
    if (error) throw error;

    await removerFotosDoBucket(fotosParaApagar);

    salvando = false;
    fecharFormulario(true);
    avisar(eraNova ? "Academia cadastrada! ✓" : "Alterações salvas! ✓");
    await carregarLista();
  } catch (erro) {
    console.error(erro);
    mostrarMensagemForm(mensagemDeErro(erro), "erro");
  } finally {
    salvando = false;
    $("btnSalvar").disabled = false;
  }
}

/* =====================================================
   EVENTOS
===================================================== */
function tratarCoordenadasColadas() {
  const texto = $("f_coordenadas").value;
  const resultado = $("coordenadasResultado");
  if (!texto.trim()) { resultado.textContent = ""; return; }

  const coords = extrairCoordenadas(texto);
  if (coords) {
    $("f_lat").value = coords.lat;
    $("f_lng").value = coords.lng;
    if (/^https?:\/\//i.test(texto.trim()) && !$("f_mapsurl").value.trim()) {
      $("f_mapsurl").value = texto.trim();
    }
    resultado.textContent = `✓ Coordenadas reconhecidas: ${coords.lat}, ${coords.lng}`;
    resultado.style.color = "var(--ok)";
  } else if (/goo\.gl|maps\.app/i.test(texto)) {
    resultado.textContent = "Esse é um link curto e eu não consigo ler ele. Abra o link no navegador e copie o endereço completo da barra (ou use o botão direito no mapa).";
    resultado.style.color = "var(--perigo)";
  } else {
    resultado.textContent = "Não consegui achar coordenadas nisso. Cole os dois números (ex: -16.7351185, -43.8416424) ou o link completo do Google Maps.";
    resultado.style.color = "var(--perigo)";
  }
}

function ligarEventos() {
  $("formLogin").addEventListener("submit", entrar);
  $("btnSair").addEventListener("click", sair);
  $("btnNova").addEventListener("click", () => abrirFormulario(null));
  $("filtroLista").addEventListener("input", renderizarLista);

  $("listaAdmin").addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    const id = Number(botao.dataset.id);
    if (botao.dataset.acao === "editar") abrirFormulario(todasAcademias.find((a) => a.id === id));
    if (botao.dataset.acao === "excluir") excluirAcademia(id);
  });

  $("formAcademia").addEventListener("submit", salvarAcademia);
  $("formAcademia").addEventListener("input", () => { formSujo = true; });
  $("btnFecharModal").addEventListener("click", () => fecharFormulario(false));
  $("btnCancelar").addEventListener("click", () => fecharFormulario(false));
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !$("modalFundo").hidden) fecharFormulario(false);
  });

  $("btnCopiarSegunda").addEventListener("click", copiarSegundaParaSemana);
  $("btnLimparHorarios").addEventListener("click", limparHorarios);
  $("f_coordenadas").addEventListener("input", tratarCoordenadasColadas);

  $("f_capa").addEventListener("change", (evento) => {
    capaNovaArquivo = evento.target.files[0] || null;
    renderizarPreviewCapa();
  });

  $("f_galeria").addEventListener("change", (evento) => {
    const escolhidas = Array.from(evento.target.files);
    const vagas = MAX_FOTOS_GALERIA - galeriaUrls.length - galeriaNovosArquivos.length;
    if (escolhidas.length > vagas) {
      mostrarMensagemForm(`A galeria aceita no máximo ${MAX_FOTOS_GALERIA} fotos.`, "erro");
    }
    galeriaNovosArquivos.push(...escolhidas.slice(0, Math.max(vagas, 0)));
    evento.target.value = ""; // permite escolher a mesma foto de novo, se precisar
    renderizarPreviewGaleria();
  });

  $("previewCapa").addEventListener("click", (evento) => {
    if (!evento.target.closest('[data-acao="remover-capa"]')) return;
    capaNovaArquivo = null;
    capaAtualUrl = null;
    $("f_capa").value = "";
    formSujo = true;
    renderizarPreviewCapa();
  });

  $("previewGaleria").addEventListener("click", (evento) => {
    const botao = evento.target.closest('[data-acao="remover-galeria"]');
    if (!botao) return;
    const i = Number(botao.dataset.i);
    if (botao.dataset.tipo === "url") galeriaUrls.splice(i, 1);
    else galeriaNovosArquivos.splice(i, 1);
    formSujo = true;
    renderizarPreviewGaleria();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  montarGridHorarios();
  montarGridEstrutura();
  ligarEventos();

  const { data } = await supabaseClient.auth.getSession();
  if (data && data.session) await mostrarPainel(data.session.user);
  else mostrarLogin();

  // Se a sessão expirar ou você sair em outra aba, volta pro login
  supabaseClient.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") mostrarLogin();
  });
});
