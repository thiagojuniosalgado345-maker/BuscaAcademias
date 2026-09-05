/*
  site.js — lógica compartilhada de TODAS as páginas do BuscaAcademias.
  Depende de cidades-data.js estar carregado antes (define window.CIDADES).
*/

const ICONE_LOCALIZACAO = `
  <svg viewBox="0 0 24 24">
    <path d="M12 21s7-6.2 7-12A7 7 0 0 0 5 9c0 5.8 7 12 7 12Z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
`;

document.addEventListener("DOMContentLoaded", () => {
  popularSelectsDeCidade();
  popularGradeDeCidades();
  marcarLinkAtivo();
  restaurarEstadoFavorito();
});

/* =====================================================
   POPULA TODOS OS DROPDOWNS DE CIDADE DA PÁGINA
   A PARTIR DA MESMA LISTA — nunca ficam fora de sincronia.
   Novos selects de cidade em outras páginas só precisam
   ser adicionados nesta lista (id + placeholder).
===================================================== */
function popularSelectsDeCidade() {
  const selects = [
    { el: document.getElementById("cidade"), placeholder: "Cidades" },
    { el: document.getElementById("cidadePrincipal"), placeholder: "Em qual cidade você quer treinar?" },
    { el: document.getElementById("cidadeCadastro"), placeholder: "Selecione a cidade" }
  ];

  selects.forEach(({ el, placeholder }) => {
    if (!el) return;

    el.innerHTML = "";

    const optPlaceholder = document.createElement("option");
    optPlaceholder.value = "";
    optPlaceholder.textContent = placeholder;
    el.appendChild(optPlaceholder);

    CIDADES.forEach((cidade) => {
      const opt = document.createElement("option");
      opt.value = cidade.arquivo;
      opt.textContent = `${cidade.nome} - ${cidade.uf}`;
      el.appendChild(opt);
    });
  });
}

/* =====================================================
   GERA OS CARDS DA SEÇÃO "ACADEMIAS" A PARTIR DA
   MESMA LISTA DE CIDADES
===================================================== */
function popularGradeDeCidades() {
  const grid = document.getElementById("citiesGrid");
  if (!grid) return;

  grid.innerHTML = CIDADES.map((cidade) => `
    <article class="city">
      <div class="cityInfo">
        <div class="cityIcon">${ICONE_LOCALIZACAO}</div>
        <div>
          <h3>${cidade.nome}</h3>
          <p>${cidade.uf === "MG" ? "Minas Gerais" : cidade.uf}</p>
        </div>
      </div>
      <a class="cityBtn" href="${cidade.arquivo}">Ver academias →</a>
    </article>
  `).join("");
}

/* =====================================================
   NAVEGAÇÃO
===================================================== */
function abrirCidade(pagina) {
  if (pagina) {
    window.location.href = pagina;
  }
}

function buscarAcademias() {
  const select = document.getElementById("cidadePrincipal");
  const cidade = select ? select.value : "";

  if (cidade) {
    window.location.href = cidade;
  } else {
    if (select) select.focus();
    alert("Escolha uma cidade para continuar.");
  }
}

/* =====================================================
   DESTACA O LINK DA PÁGINA ATUAL NO MENU
===================================================== */
function marcarLinkAtivo() {
  const paginaAtual = window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".menu ul a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === paginaAtual) {
      link.classList.add("ativo");
    } else {
      link.classList.remove("ativo");
    }
  });
}

/* =====================================================
   FAVORITOS (localStorage — funciona sem backend)
===================================================== */
function alternarFavorito() {
  const paginaAtual = window.location.pathname.split("/").pop() || "index.html";
  const favoritos = JSON.parse(localStorage.getItem("favoritos") || "[]");

  const index = favoritos.indexOf(paginaAtual);
  if (index === -1) {
    favoritos.push(paginaAtual);
  } else {
    favoritos.splice(index, 1);
  }

  localStorage.setItem("favoritos", JSON.stringify(favoritos));
  restaurarEstadoFavorito();
}

function restaurarEstadoFavorito() {
  const botao = document.querySelector(".favoritoMenu");
  if (!botao) return;

  const paginaAtual = window.location.pathname.split("/").pop() || "index.html";
  const favoritos = JSON.parse(localStorage.getItem("favoritos") || "[]");

  botao.classList.toggle("ativo", favoritos.includes(paginaAtual));
}

/* =====================================================
   ENVIO DE FORMULÁRIOS (Formspree)
   Usado pelos formulários de "Cadastrar minha academia"
   e "Fale conosco" em contato.html.

   Como usar num form:
   <form data-formspree-endpoint="https://formspree.io/f/XXXX"
         onsubmit="handleFormSubmit(event, this)">
     ...campos...
     <p class="formFeedback"></p>
   </form>
===================================================== */
function handleFormSubmit(event, formEl) {
  const feedbackEl = formEl.querySelector(".formFeedback");
  enviarFormularioFormspree(event, formEl, feedbackEl);
}

async function enviarFormularioFormspree(event, formEl, feedbackEl) {
  event.preventDefault();

  const endpoint = formEl.getAttribute("data-formspree-endpoint");
  const botao = formEl.querySelector("button[type=submit]");

  if (feedbackEl) {
    feedbackEl.textContent = "Enviando...";
    feedbackEl.className = "formFeedback enviando";
  }
  if (botao) botao.disabled = true;

  try {
    const resposta = await fetch(endpoint, {
      method: "POST",
      body: new FormData(formEl),
      headers: { Accept: "application/json" }
    });

    if (resposta.ok) {
      formEl.reset();
      if (feedbackEl) {
        feedbackEl.textContent = "Enviado! Vamos entrar em contato em breve.";
        feedbackEl.className = "formFeedback sucesso";
      }
    } else {
      if (feedbackEl) {
        feedbackEl.textContent = "Não foi possível enviar. Tenta de novo em instantes.";
        feedbackEl.className = "formFeedback erro";
      }
    }
  } catch (erro) {
    if (feedbackEl) {
      feedbackEl.textContent = "Não foi possível enviar. Verifica sua internet e tenta de novo.";
      feedbackEl.className = "formFeedback erro";
    }
  } finally {
    if (botao) botao.disabled = false;
  }
}
