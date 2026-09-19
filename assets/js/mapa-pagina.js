/*
  mapa-pagina.js — busca as academias da cidade no Supabase e
  inicializa o mapa (usando a função criarMapaAcademias, de
  mapa-academias.js) na página mapa.html.
*/

const SUPABASE_URL = "https://bsihmwcnixszgiaovbnf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lNPnVij18jTBa1R8QG_TAA_eCizvL9F";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  const cidadeSlug = document.body.dataset.cidade || "montes-claros";

  const { data, error } = await supabaseClient
    .from("academias")
    .select("*")
    .eq("cidade", cidadeSlug);

  if (error || !data) {
    document.getElementById("mapaAcademias").innerHTML =
      "<p class='semResultado'><strong>Não foi possível carregar o mapa agora.</strong></p>";
    return;
  }

  const academias = data.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    bairro: linha.bairro,
    foto: linha.foto,
    avaliacao: Number(linha.avaliacao),
    coordenadas:
      linha.latitude != null && linha.longitude != null
        ? { lat: linha.latitude, lng: linha.longitude }
        : null
  }));

  criarMapaAcademias("mapaAcademias", academias);
});
