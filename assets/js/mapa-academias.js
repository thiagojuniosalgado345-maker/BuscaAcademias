/*
  mapa-academias.js — motor do mapa customizado do BuscaAcademias.
  Usa Leaflet + OpenStreetMap (gratuito, sem chave de API, sem
  cartão de crédito).

  Cada academia vira um "pino" circular com a própria foto dentro,
  e ao clicar mostra um balão com nome, bairro, nota e um link pra
  página de perfil completa.

  Espera academias no formato:
  { id, nome, bairro, foto, avaliacao, coordenadas: {lat, lng} | null }

  Academias sem coordenadas são ignoradas (não aparecem no mapa).
*/

// Imagem padrão (SVG embutido, não depende de arquivo) usada quando a
// academia ainda não tem foto cadastrada.
window.FOTO_PADRAO = window.FOTO_PADRAO || "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 260'><rect width='400' height='260' fill='#0A1E3D'/>" +
  "<g fill='none' stroke='#2C4A78' stroke-width='10' stroke-linecap='round'><path d='M140 122h120'/><path d='M122 92v60M102 102v40M278 92v60M298 102v40'/></g>" +
  "<text x='200' y='200' font-family='Arial,sans-serif' font-size='16' text-anchor='middle' fill='#4E6A96'>Foto em breve</text></svg>"
);

function criarMapaAcademias(containerId, academias) {
  const CENTRO_PADRAO = [-16.7282, -43.8578]; // Montes Claros, aproximado

  const academiasComCoordenadas = (academias || []).filter(
    (a) => a.coordenadas && a.coordenadas.lat != null && a.coordenadas.lng != null
  );

  const mapa = L.map(containerId).setView(CENTRO_PADRAO, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(mapa);

  if (academiasComCoordenadas.length === 0) {
    return mapa;
  }

  const marcadores = academiasComCoordenadas.map((academia) => {
    // Prioridade no pino: logo (se tiver) > foto principal > placeholder.
    // A logo usa fundo branco + "contain" (pra não cortar), já a foto usa
    // "cover" (preenche o círculo todo) — por isso a classe extra.
    const usaLogo = !!academia.logo;
    const imagemPino = academia.logo || academia.foto || FOTO_PADRAO;

    const icone = L.divIcon({
      className: "pinAcademiaWrapper",
      html: `
        <div class="pinAcademia${usaLogo ? " pinComLogo" : ""}">
          <img src="${imagemPino}" alt="${academia.nome}">
        </div>
      `,
      iconSize: [48, 58],
      iconAnchor: [24, 58],
      popupAnchor: [0, -56]
    });

    const marcador = L.marker([academia.coordenadas.lat, academia.coordenadas.lng], { icon: icone }).addTo(mapa);

    const nota = academia.avaliacao
      ? `⭐ ${Number(academia.avaliacao).toFixed(1).replace(".", ",")}`
      : "";

    marcador.bindPopup(`
      <div class="popupAcademia">
        <strong>${academia.nome}</strong>
        <p>${academia.bairro || ""}${nota ? " · " + nota : ""}</p>
        <a href="academia.html?id=${academia.id}">Ver detalhes →</a>
      </div>
    `);

    return marcador;
  });

  if (marcadores.length === 1) {
    // Com um pino só, fitBounds deixaria o zoom exagerado (dá zoom
    // máximo num "retângulo" de tamanho zero). Centraliza direto
    // nele com um zoom que ainda mostra o entorno do bairro.
    mapa.setView(marcadores[0].getLatLng(), 16);
  } else {
    const grupo = L.featureGroup(marcadores);
    mapa.fitBounds(grupo.getBounds().pad(0.2));
  }

  return mapa;
}
