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
    const icone = L.divIcon({
      className: "pinAcademiaWrapper",
      html: `
        <div class="pinAcademia">
          <img src="${academia.foto || ""}" alt="${academia.nome}">
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
