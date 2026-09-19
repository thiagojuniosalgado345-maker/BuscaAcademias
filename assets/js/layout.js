/*
  layout.js — menu (nav) e rodapé (footer) compartilhados por TODAS
  as páginas do site. Editando este arquivo uma vez, a mudança
  aparece em todo lugar — sem precisar repetir a edição em cada
  página.

  Como usar numa página:
  1. No lugar de escrever o <nav class="menu">...</nav> inteiro,
     coloque só: <div id="menuTopo"></div>
  2. No lugar do <footer>...</footer> inteiro, coloque só:
     <div id="rodape"></div>
  3. Carregue este script ANTES do site.js (ordem importa!):
     <script src="assets/js/layout.js"></script>
     <script src="assets/js/site.js"></script>

  Esse script "monta" o menu/rodapé de verdade assim que a página
  carrega, e o site.js (que já existia) continua funcionando do
  mesmo jeito, populando o dropdown de cidade etc. — ele só precisa
  rodar DEPOIS deste aqui.
*/

const HTML_MENU = `
<nav class="menu">

  <a href="index.html" class="logoMenu">
    <span class="logoIcon">⌖</span>
    BUSCA<span>ACADEMIAS</span>
  </a>

  <ul>
    <li><a href="index.html">Início</a></li>
    <li>
      <select id="cidade" onchange="abrirCidade(this.value)" aria-label="Escolha uma cidade"></select>
    </li>
    <li><a href="mapa.html">Mapa</a></li>
    <li><a href="contato.html">Contato</a></li>
  </ul>

  <div class="menuDireita">
    <button
      type="button"
      class="favoritoMenu"
      aria-label="Favoritar esta página"
      onclick="alternarFavorito()"
    >
      ♡
    </button>

    <a href="contato.html#cadastro" class="cadastrar">
      Cadastrar minha academia
    </a>
  </div>

</nav>
`;

const HTML_RODAPE = `
<footer>

  <strong>BuscaAcademias</strong>
  <br>
  Encontre. Compare. Escolha.

  <nav aria-label="Links do rodapé">
    <a href="index.html">Início</a>
    <a href="mapa.html">Mapa</a>
    <a href="contato.html">Contato</a>
  </nav>

  <br>
  © BuscaAcademias 2026

</footer>
`;

document.addEventListener("DOMContentLoaded", () => {
  const menuPlaceholder = document.getElementById("menuTopo");
  if (menuPlaceholder) {
    menuPlaceholder.outerHTML = HTML_MENU;
  }

  const rodapePlaceholder = document.getElementById("rodape");
  if (rodapePlaceholder) {
    rodapePlaceholder.outerHTML = HTML_RODAPE;
  }
});
