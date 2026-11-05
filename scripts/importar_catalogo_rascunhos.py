import os
import re
from urllib.parse import quote_plus

import requests


# =====================================================
# CONFIGURACAO
# =====================================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"

TABELA_CANDIDATAS = "academias_candidatas_cnpj"
TABELA_PUBLICA = "academias"

TAMANHO_LOTE = 50
TIMEOUT = 60

CATEGORIAS_PERMITIDAS = [
    "Academia",
    "Centro de treinamento",
    "Escola de atividade física",
    "Estúdio especializado",
    "Pilates",
    "Clube / complexo esportivo",
    "Centro de atividade física e bem-estar",
]

session = requests.Session()


# =====================================================
# VALIDACAO E CONEXAO
# =====================================================

def validar_configuracao():
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL não configurado.")

    if not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_SECRET_KEY não configurado.")


def headers_supabase(prefer=None):
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    if prefer:
        headers["Prefer"] = prefer

    return headers


def endpoint(tabela):
    return f"{SUPABASE_URL}/rest/v1/{tabela}"


# =====================================================
# BUSCAR CANDIDATOS SELECIONADOS
# =====================================================

def buscar_candidatos():
    categorias = "in.(" + ",".join(
        '"' + categoria.replace('"', '\\"') + '"'
        for categoria in CATEGORIAS_PERMITIDAS
    ) + ")"

    resposta = session.get(
        endpoint(TABELA_CANDIDATAS),
        headers=headers_supabase(),
        params={
            "select": (
                "id,cnpj,cidade,nome_fantasia,razao_social,"
                "bairro,endereco,telefone,categoria_sugerida,status_revisao"
            ),
            "status_revisao": "eq.pendente",
            "categoria_sugerida": categorias,
            "order": "id.asc",
            "limit": "1000",
        },
        timeout=TIMEOUT,
    )

    if not resposta.ok:
        raise RuntimeError(
            "Erro ao consultar candidatas no Supabase: "
            + resposta.text[:1000]
        )

    dados = resposta.json()

    if len(dados) >= 1000:
        raise RuntimeError(
            "A consulta retornou 1.000 ou mais linhas. "
            "A importação foi interrompida para evitar um lote incompleto."
        )

    return dados


# =====================================================
# NORMALIZAR DADOS
# =====================================================

def somente_digitos(valor):
    return re.sub(r"\D", "", str(valor or ""))


def texto_limpo(valor):
    if valor is None:
        return None

    texto = str(valor).strip()

    if not texto or texto.lower() == "null":
        return None

    return texto


def normalizar_cidade(cidade):
    cidade = (cidade or "").strip().lower()

    if cidade == "montes-claros":
        return "Montes Claros"

    if cidade == "janauba":
        return "Janaúba"

    raise ValueError(f"Cidade não reconhecida: {cidade}")


def transformar_candidata(candidata):
    cnpj = somente_digitos(candidata.get("cnpj"))

    nome = (
        texto_limpo(candidata.get("nome_fantasia"))
        or texto_limpo(candidata.get("razao_social"))
    )

    cidade_slug = texto_limpo(candidata.get("cidade"))
    cidade_nome = normalizar_cidade(cidade_slug)

    endereco = texto_limpo(candidata.get("endereco"))
    bairro = texto_limpo(candidata.get("bairro"))
    telefone = somente_digitos(candidata.get("telefone"))
    telefone = telefone or None

    categoria = texto_limpo(candidata.get("categoria_sugerida"))

    if len(cnpj) != 14:
        raise ValueError("CNPJ ausente ou inválido.")

    if not nome:
        raise ValueError("Nome ausente.")

    if not endereco:
        raise ValueError("Endereço ausente.")

    if categoria not in CATEGORIAS_PERMITIDAS:
        raise ValueError("Categoria não permitida.")

    consulta_maps = quote_plus(
        f"{nome}, {endereco}, {cidade_nome}, MG, Brasil"
    )

    return {
        "cnpj": cnpj,
        "nome": nome,
        "cidade": cidade_slug,
        "bairro": bairro,
        "endereco": endereco,
        "telefone": telefone,
        # Telefone cadastral não é tratado como WhatsApp confirmado.
        "whatsapp": None,
        "categoria": categoria,
        "publicado": False,
        "foto": None,
        "avaliacao": None,
        "modalidades": [],
        "maps_url": (
            "https://www.google.com/maps/search/?api=1&query="
            + consulta_maps
        ),
    }


# =====================================================
# VERIFICAR CNPJS JA PRESENTES NA TABELA PUBLICA
# =====================================================

def consultar_cnpjs_publicados(cnpjs):
    existentes = set()

    for inicio in range(0, len(cnpjs), 80):
        grupo = cnpjs[inicio:inicio + 80]
        filtro = "in.(" + ",".join(grupo) + ")"

        resposta = session.get(
            endpoint(TABELA_PUBLICA),
            headers=headers_supabase(),
            params={
                "select": "cnpj",
                "cnpj": filtro,
                "limit": "100",
            },
            timeout=TIMEOUT,
        )

        if not resposta.ok:
            raise RuntimeError(
                "Erro ao verificar CNPJs já existentes na tabela pública: "
                + resposta.text[:1000]
            )

        for linha in resposta.json():
            cnpj = somente_digitos(linha.get("cnpj"))
            if cnpj:
                existentes.add(cnpj)

    return existentes


# =====================================================
# INSERIR RASCUNHOS NA TABELA PUBLICA
# =====================================================

def inserir_lotes(registros):
    total_inseridos = 0

    for inicio in range(0, len(registros), TAMANHO_LOTE):
        lote = registros[inicio:inicio + TAMANHO_LOTE]

        resposta = session.post(
            endpoint(TABELA_PUBLICA),
            headers=headers_supabase("return=representation"),
            json=lote,
            timeout=TIMEOUT,
        )

        if not resposta.ok:
            raise RuntimeError(
                "Erro ao inserir rascunhos no catálogo: "
                + resposta.text[:1500]
            )

        retornados = resposta.json()

        if len(retornados) != len(lote):
            raise RuntimeError(
                "O Supabase retornou quantidade diferente da enviada. "
                "Interrompendo para conferência."
            )

        if any(linha.get("publicado") is not False for linha in retornados):
            raise RuntimeError(
                "Uma linha retornou publicado diferente de false. "
                "Interrompendo para conferência."
            )

        total_inseridos += len(retornados)

        print(
            f"Lote inserido como rascunho: "
            f"{total_inseridos}/{len(registros)}"
        )

    return total_inseridos


# =====================================================
# EXECUCAO
# =====================================================

def main():
    validar_configuracao()

    print("============================================")
    print("IMPORTACAO DE CANDIDATOS PARA O CATALOGO")
    print("============================================")
    print("Modo:", "SIMULAÇÃO" if DRY_RUN else "IMPORTAÇÃO REAL")

    candidatos = buscar_candidatos()
    print("Candidatos retornados:", len(candidatos))

    por_cnpj = {}
    descartados = 0

    for candidata in candidatos:
        try:
            registro = transformar_candidata(candidata)
        except (ValueError, TypeError) as erro:
            descartados += 1
            print(
                f"Candidata ID {candidata.get('id')} ignorada: {erro}"
            )
            continue

        cnpj = registro["cnpj"]

        if cnpj in por_cnpj:
            raise RuntimeError(
                "CNPJ duplicado dentro da lista de candidatas: "
                + cnpj
            )

        por_cnpj[cnpj] = registro

    registros = list(por_cnpj.values())
    cnpjs = [registro["cnpj"] for registro in registros]

    existentes = consultar_cnpjs_publicados(cnpjs)

    novos = [
        registro
        for registro in registros
        if registro["cnpj"] not in existentes
    ]

    ja_importados = len(registros) - len(novos)

    print("\n--------------- RESUMO ----------------")
    print("Candidatos retornados:", len(candidatos))
    print("Registros válidos:", len(registros))
    print("Descartados por dados incompletos:", descartados)
    print("Já existentes na tabela pública:", ja_importados)
    print("Novos rascunhos preparados:", len(novos))
    print("Rascunhos publicados:", 0)

    print("\nDistribuição dos novos rascunhos:")
    for cidade in ["montes-claros", "janauba"]:
        quantidade = sum(
            1 for registro in novos
            if registro["cidade"] == cidade
        )
        print(f"{cidade}: {quantidade}")

    print("\nDistribuição por categoria:")
    for categoria in CATEGORIAS_PERMITIDAS:
        quantidade = sum(
            1 for registro in novos
            if registro["categoria"] == categoria
        )
        if quantidade:
            print(f"{categoria}: {quantidade}")

    if DRY_RUN:
        print("\nSIMULAÇÃO CONCLUÍDA.")
        print("Nenhuma linha foi inserida ou alterada.")
        return

    inseridos = inserir_lotes(novos)

    print("\nIMPORTAÇÃO CONCLUÍDA.")
    print("Rascunhos inseridos:", inseridos)
    print("Todos foram enviados com publicado = false.")
    print("As candidatas originais foram preservadas.")


if __name__ == "__main__":
    main()
