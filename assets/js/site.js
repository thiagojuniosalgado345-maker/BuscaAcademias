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

function popularSelectsDeCidade() {
  const selects = [
    { el: document.getElementById("cidade"), placeholder: "Cidades" },
    { el: document.getElementById("cidadePrincipal"), placeholder: "Em qual cidade você quer treinar?" }
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
