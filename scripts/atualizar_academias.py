
import os
import re
import time
import unicodedata
from datetime import datetime, timezone

import requests


# ==========================================
# CONFIGURAÇÃO
# ==========================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

CIDADES = [
    {"nome": "Montes Claros", "slug": "montes-claros"},
    {"nome": "Janaúba", "slug": "janauba"},
]

session = requests.Session()


def verificar_configuracao():

    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "SUPABASE_URL ou SUPABASE_SECRET_KEY não configurado."
        )

    if not SUPABASE_URL.startswith("https://"):
        raise RuntimeError("SUPABASE_URL inválida.")


def supabase_request(method, endpoint, extra_headers=None, **kwargs):

    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    if method in ("POST", "PATCH"):
        headers["Prefer"] = "return=minimal"

    if extra_headers:
        headers.update(extra_headers)

    resposta = session.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{endpoint}",
        headers=headers,
        timeout=45,
        **kwargs
    )

    if not resposta.ok:
        raise RuntimeError(
            f"Erro no Supabase ({resposta.status_code}): "
            f"{resposta.text[:500]}"
        )

    return resposta


# ==========================================
# NORMALIZAÇÃO
# ==========================================

def normalizar(texto):

    texto = unicodedata.normalize("NFKD", texto or "")

    texto = "".join(
        c for c in texto
        if not unicodedata.combining(c)
    )

    return re.sub(r"[^a-z0-9]", "", texto.lower())


def vazio(valor):

    return valor is None or valor == "" or valor == []


# ==========================================
# BUSCAR ACADEMIAS NO OPENSTREETMAP
# ==========================================

def buscar_openstreetmap(cidade):

    consulta = f"""
    [out:json][timeout:90];

    area
      ["name"="{cidade['nome']}"]
      ["boundary"="administrative"]
      ->.areaCidade;

    (
      nwr["leisure"="fitness_centre"](area.areaCidade);

      nwr["amenity"="gym"](area.areaCidade);

      nwr
        ["leisure"="sports_centre"]
        ["sport"~"fitness|gym",i]
        (area.areaCidade);
    );

    out center tags;
    """

    for tentativa in range(3):

        try:

            resposta = session.post(
                OVERPASS_URL,
                data={"data": consulta},
                headers={"User-Agent": "BuscaAcademias/1.0"},
                timeout=120
            )

            resposta.raise_for_status()

            dados = resposta.json()

            if dados.get("remark"):
                raise RuntimeError(dados["remark"])

            return dados.get("elements", [])

        except (
            requests.RequestException,
            ValueError,
            RuntimeError
        ) as erro:

            print(
                f"Erro na busca de {cidade['nome']}: {erro}"
            )

            if tentativa == 2:
                raise

            time.sleep(15 * (tentativa + 1))


# ==========================================
# ORGANIZAR OS DADOS
# ==========================================

def organizar_academia(elemento, cidade):

    tags = elemento.get("tags", {})

    nome = tags.get("name")

    if not nome:
        return None

    centro = elemento.get("center", {})

    latitude = elemento.get("lat", centro.get("lat"))
    longitude = elemento.get("lon", centro.get("lon"))

    if latitude is None or longitude is None:
        return None

    rua = tags.get("addr:street", "")
    numero = tags.get("addr:housenumber", "")

    endereco = tags.get("addr:full", "")

    if not endereco and rua:
        endereco = f"{rua}, {numero}".strip(", ")

    bairro = (
        tags.get("addr:suburb")
        or tags.get("addr:neighbourhood")
        or tags.get("addr:district")
        or ""
    )

    site = (
        tags.get("contact:website")
        or tags.get("website")
        or ""
    )

    # Só identificamos WhatsApp quando a fonte
    # declara expressamente que é WhatsApp.

    whatsapp = tags.get("contact:whatsapp", "")

    if whatsapp:
        whatsapp = re.sub(r"\D", "", whatsapp)

    modalidades = []

    if tags.get("sport"):
        modalidades = [
            item.strip()
            for item in re.split(r"[;,]", tags["sport"])
            if item.strip()
        ]

    return {

        "osm_type": elemento["type"],
        "osm_id": elemento["id"],

        "cidade": cidade["slug"],
        "nome": nome,

        "bairro": bairro,
        "endereco": endereco,

        "latitude": float(latitude),
        "longitude": float(longitude),

        "site": site,

        "whatsapp": whatsapp,

        "modalidades": modalidades,

        "maps_url": (
            "https://www.google.com/maps/search/?api=1"
            f"&query={latitude},{longitude}"
        ),

        "origem_dados": "OpenStreetMap",

        "osm_atualizado_em": datetime.now(
            timezone.utc
        ).isoformat()

    }


# ==========================================
# LER ACADEMIAS JÁ CADASTRADAS
# ==========================================

def buscar_cadastradas(slug):

    resposta = supabase_request(
        "GET",
        "academias",
        params={
            "select": (
                "id,cidade,nome,bairro,endereco,latitude,"
                "longitude,site,whatsapp,modalidades,"
                "osm_type,osm_id,origem_dados"
            ),
            "cidade": f"eq.{slug}",
            "limit": "1000"
        }
    )

    return resposta.json()


# ==========================================
# ATUALIZAR REGISTRO EXISTENTE
# ==========================================

def atualizar_registro(registro, dados, cadastro_manual=False):
    if DRY_RUN:
        print(
            f"[TESTE] Atualizaria: {registro.get('nome')} "
            f"(ID {registro.get('id')})"
        )
        return

    atualizacao = {
        "osm_type": dados["osm_type"],
        "osm_id": dados["osm_id"],
        "osm_atualizado_em": dados["osm_atualizado_em"],
    }

    if cadastro_manual:

        # Preserva os dados manuais.
        # Só completa os campos que estão vazios.

        campos = [
            "bairro",
            "endereco",
            "latitude",
            "longitude",
            "site",
            "whatsapp",
            "modalidades",
            "maps_url",
        ]

        for campo in campos:

            valor = dados.get(campo)

            if vazio(registro.get(campo)) and not vazio(valor):
                atualizacao[campo] = valor

        atualizacao["origem_dados"] = (
            "Cadastro manual vinculado ao OpenStreetMap"
        )

    else:

        # Registros criados pelo importador podem
        # receber atualizações da fonte original.

        campos = [
            "nome",
            "bairro",
            "endereco",
            "latitude",
            "longitude",
            "site",
            "whatsapp",
            "modalidades",
            "maps_url",
        ]

        for campo in campos:

            valor = dados.get(campo)

            if not vazio(valor):
                atualizacao[campo] = valor

        atualizacao["origem_dados"] = "OpenStreetMap"

    supabase_request(
        "PATCH",
        "academias",
        params={"id": f"eq.{registro['id']}"},
        json=atualizacao
    )


# ==========================================
# INSERIR ACADEMIA NOVA
# ==========================================

def inserir_academia(dados):
    if DRY_RUN:
        print(
            f"[TESTE] Inseriria: {dados['nome']} "
            f"({dados['cidade']})"
        )
        return

    supabase_request(
        "POST",
        "academias",
        params={"on_conflict": "osm_type,osm_id"},
        extra_headers={
            "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        json=dados
    )


# ==========================================
# PROCESSAR CADA CIDADE
# ==========================================

def importar_cidade(cidade):

    print("\n====================================")
    print("Cidade:", cidade["nome"])
    print("====================================")

    elementos = buscar_openstreetmap(cidade)

    print("Registros encontrados na fonte:", len(elementos))

    # Remove elementos repetidos da própria consulta.

    unicos = {}

    for elemento in elementos:

        chave = (elemento["type"], elemento["id"])
        unicos[chave] = elemento

    cadastradas = buscar_cadastradas(cidade["slug"])

    por_osm = {
        (r["osm_type"], int(r["osm_id"])): r
        for r in cadastradas
        if r.get("osm_type") and r.get("osm_id") is not None
    }

    inseridas = 0
    atualizadas = 0
    vinculadas = 0
    ignoradas = 0

    for elemento in unicos.values():

        dados = organizar_academia(elemento, cidade)

        if not dados:
            ignoradas += 1
            continue

        chave = (dados["osm_type"], dados["osm_id"])

        # 1. A academia já possui identificador OSM.

        existente = por_osm.get(chave)

        if existente:

            manual = (
                existente.get("origem_dados")
                != "OpenStreetMap"
            )

            atualizar_registro(
                existente,
                dados,
                cadastro_manual=manual
            )

            atualizadas += 1
            continue

        # 2. Procurar cadastro manual com o mesmo nome.

        mesmos_nomes = [
            r for r in cadastradas
            if normalizar(r["nome"]) == normalizar(dados["nome"])
        ]

        if len(mesmos_nomes) == 1:

            existente = mesmos_nomes[0]

            if not existente.get("osm_id"):

                atualizar_registro(
                    existente,
                    dados,
                    cadastro_manual=True
                )

                existente["osm_type"] = dados["osm_type"]
                existente["osm_id"] = dados["osm_id"]

                por_osm[chave] = existente

                vinculadas += 1
                continue

        # Se houver nomes iguais ambíguos, não cria
        # outro cadastro automaticamente.

        if mesmos_nomes:

            print(
                "Revisão necessária: nome já cadastrado -",
                dados["nome"]
            )

            ignoradas += 1
            continue

        # 3. Inserir academia nova.

        inserir_academia(dados)

        inseridas += 1

        cadastradas.append(dados)
        por_osm[chave] = dados

    print("\nResultado de", cidade["nome"])
    print("Novas:", inseridas)
    print("Atualizadas:", atualizadas)
    print("Cadastros manuais vinculados:", vinculadas)
    print("Ignoradas para revisão:", ignoradas)


# ==========================================
# EXECUÇÃO
# ==========================================

def main():

    verificar_configuracao()

    for indice, cidade in enumerate(CIDADES):

        importar_cidade(cidade)

        if indice < len(CIDADES) - 1:
            time.sleep(8)

    print("\nIMPORTAÇÃO FINALIZADA!")


if __name__ == "__main__":
    main()
