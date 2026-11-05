
import os
import json
import unicodedata
from datetime import date, datetime

import requests

from google.cloud import bigquery
from google.oauth2 import service_account


# ==========================================
# CONFIGURAÇÕES
# ==========================================

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")

GOOGLE_CREDENTIALS_JSON = os.getenv(
    "GOOGLE_CREDENTIALS_JSON", ""
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")

SUPABASE_SECRET_KEY = os.getenv(
    "SUPABASE_SECRET_KEY", ""
)

DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"

MAX_BYTES_BILLED = 30 * 1024 ** 3

TABELA_SUPABASE = "academias_candidatas_cnpj"

session = requests.Session()


# ==========================================
# CONSULTA BIGQUERY
# ==========================================

SQL = """
SELECT

    cnpj,
    razao_social,
    nome_fantasia,

    UPPER(endereco.municipio) AS cidade,

    situacao_cadastral.codigo AS situacao_cadastral,

    cnaes.principal.codigo AS cnae_principal,

    EXISTS (
        SELECT 1
        FROM UNNEST(cnaes.secundarios) AS secundario
        WHERE secundario.codigo = '9313100'
    ) AS possui_cnae_secundario,

    endereco.tipo_logradouro,
    endereco.logradouro,
    endereco.numero,
    endereco.complemento,
    endereco.bairro,
    endereco.cep,

    COALESCE(
        NULLIF(
            CONCAT(
                COALESCE(telefone1.ddd, ''),
                COALESCE(telefone1.telefone, '')
            ), ''
        ),
        NULLIF(
            CONCAT(
                COALESCE(telefone2.ddd, ''),
                COALESCE(telefone2.telefone, '')
            ), ''
        )
    ) AS telefone,

    data_inicio_atividade

FROM `cloud-cnpj.gold.estabelecimentos`

WHERE

    situacao_cadastral.codigo = '02'

    AND endereco.uf = 'MG'

    AND UPPER(endereco.municipio) IN (
        'MONTES CLAROS',
        'JANAUBA',
        'JANAÚBA'
    )

    AND (
        cnaes.principal.codigo = '9313100'

        OR EXISTS (
            SELECT 1
            FROM UNNEST(cnaes.secundarios) AS secundario
            WHERE secundario.codigo = '9313100'
        )
    )

ORDER BY
    cidade,
    razao_social
"""


# ==========================================
# NORMALIZAR CIDADE
# ==========================================

def normalizar(texto):

    texto = unicodedata.normalize(
        "NFKD",
        texto or ""
    )

    return "".join(
        c for c in texto
        if not unicodedata.combining(c)
    ).strip().upper()


def cidade_slug(cidade):

    cidade = normalizar(cidade)

    if cidade == "MONTES CLAROS":
        return "montes-claros"

    if cidade == "JANAUBA":
        return "janauba"

    raise ValueError(
        f"Cidade não reconhecida: {cidade}"
    )


# ==========================================
# CONECTAR BIGQUERY
# ==========================================

def conectar_bigquery():

    if not PROJECT_ID:
        raise RuntimeError(
            "GCP_PROJECT_ID não configurado."
        )

    if not GOOGLE_CREDENTIALS_JSON:
        raise RuntimeError(
            "GOOGLE_CREDENTIALS_JSON não configurado."
        )

    informacoes = json.loads(
        GOOGLE_CREDENTIALS_JSON
    )

    credenciais = (
        service_account.Credentials
        .from_service_account_info(informacoes)
    )

    return bigquery.Client(
        project=PROJECT_ID,
        credentials=credenciais
    )


# ==========================================
# EXECUTAR CONSULTA
# ==========================================

def consultar_empresas():

    client = conectar_bigquery()

    print("Conexão com BigQuery estabelecida.")

    print("Calculando volume da consulta...")

    config_teste = bigquery.QueryJobConfig(
        dry_run=True,
        use_query_cache=False
    )

    teste = client.query(
        SQL,
        job_config=config_teste
    )

    bytes_estimados = teste.total_bytes_processed or 0

    print(
        "Volume estimado:",
        round(bytes_estimados / (1024 ** 3), 2),
        "GB"
    )

    if bytes_estimados > MAX_BYTES_BILLED:

        raise RuntimeError(
            "Consulta ultrapassou o limite de 30 GB. "
            "Nenhum resultado foi importado."
        )

    config = bigquery.QueryJobConfig(
        maximum_bytes_billed=MAX_BYTES_BILLED,
        use_query_cache=True
    )

    job = client.query(
        SQL,
        job_config=config
    )

    resultados = []

    for linha in job.result():

        resultados.append(
            dict(linha.items())
        )

    print(
        "Empresas encontradas:",
        len(resultados)
    )

    return resultados


# ==========================================
# ORGANIZAR REGISTROS
# ==========================================

def organizar_registro(registro):

    cidade = cidade_slug(
        registro.get("cidade")
    )

    partes = [
        registro.get("tipo_logradouro"),
        registro.get("logradouro")
    ]

    logradouro = " ".join(
        str(p).strip()
        for p in partes
        if p and str(p).strip()
    )

    endereco = logradouro

    numero = registro.get("numero")
    complemento = registro.get("complemento")

    if numero:
        endereco += f", {numero}"

    if complemento:
        endereco += f" - {complemento}"

    endereco = endereco.strip() or None

    data_inicio = registro.get(
        "data_inicio_atividade"
    )

    if isinstance(data_inicio, (date, datetime)):
        data_inicio = data_inicio.isoformat()

    telefone = registro.get("telefone")

    if telefone:
        telefone = str(telefone).strip()

    original = {
        "cnae_principal": registro.get("cnae_principal"),
        "possui_cnae_secundario": bool(
            registro.get("possui_cnae_secundario")
        ),
        "tipo_logradouro": registro.get("tipo_logradouro"),
        "logradouro": registro.get("logradouro"),
        "numero": registro.get("numero"),
        "complemento": registro.get("complemento"),
        "bairro": registro.get("bairro"),
        "cep": registro.get("cep"),
        "data_inicio_atividade": data_inicio
    }

    return {

        "cnpj": str(registro["cnpj"]).zfill(14),

        "razao_social": registro.get("razao_social"),

        "nome_fantasia": registro.get("nome_fantasia"),

        "cidade": cidade,

        "endereco": endereco,

        "bairro": registro.get("bairro"),

        "cep": registro.get("cep"),

        "telefone": telefone,

        "cnae_principal": str(
            registro.get("cnae_principal") or ""
        ),

        "possui_cnae_secundario": bool(
            registro.get("possui_cnae_secundario")
        ),

        "data_inicio_atividade": data_inicio,

        "situacao_cadastral": str(
            registro.get("situacao_cadastral") or ""
        ),

        "dados_originais": original

    }


# ==========================================
# CONECTAR SUPABASE
# ==========================================

def configurar_supabase():

    if not SUPABASE_URL:
        raise RuntimeError(
            "SUPABASE_URL não configurado."
        )

    if not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "SUPABASE_SECRET_KEY não configurado."
        )

    return {

        "apikey": SUPABASE_SECRET_KEY,

        "Authorization": (
            f"Bearer {SUPABASE_SECRET_KEY}"
        ),

        "Content-Type": "application/json",

        "Accept": "application/json"

    }


# ==========================================
# VERIFICAR CNPJs JÁ CADASTRADOS
# ==========================================

def consultar_cnpjs_existentes(cnpjs, headers):

    existentes = set()

    endpoint = (
        f"{SUPABASE_URL}/rest/v1/"
        f"{TABELA_SUPABASE}"
    )

    for inicio in range(0, len(cnpjs), 80):

        grupo = cnpjs[inicio:inicio + 80]

        filtro = "in.(" + ",".join(grupo) + ")"

        resposta = session.get(

            endpoint,

            headers=headers,

            params={
                "select": "cnpj",
                "cnpj": filtro
            },

            timeout=45

        )

        if not resposta.ok:

            raise RuntimeError(
                "Erro ao consultar CNPJs no Supabase: "
                + resposta.text[:500]
            )

        for registro in resposta.json():

            existentes.add(
                str(registro["cnpj"])
            )

    return existentes


# ==========================================
# INSERIR NOVOS CANDIDATOS
# ==========================================

def inserir_candidatos(registros, headers):

    endpoint = (
        f"{SUPABASE_URL}/rest/v1/"
        f"{TABELA_SUPABASE}"
    )

    inseridos = 0

    for inicio in range(0, len(registros), 100):

        grupo = registros[inicio:inicio + 100]

        resposta = session.post(

            endpoint,

            headers={
                **headers,
                "Prefer": "return=minimal,missing=default"
            },

            json=grupo,

            timeout=60

        )

        if not resposta.ok:

            raise RuntimeError(
                "Erro ao inserir candidatos no Supabase: "
                + resposta.text[:1000]
            )

        inseridos += len(grupo)

        print(
            f"Lote enviado: {len(grupo)} registros."
        )

    return inseridos


# ==========================================
# EXECUÇÃO PRINCIPAL
# ==========================================

def main():

    print("====================================")
    print("IMPORTAÇÃO DE CANDIDATOS DE CNPJ")
    print("====================================")

    print(
        "Modo de execução:",
        "SIMULAÇÃO" if DRY_RUN else "IMPORTAÇÃO REAL"
    )

    # 1. Consultar BigQuery.

    resultados = consultar_empresas()

    # 2. Organizar registros.

    organizados = [
        organizar_registro(registro)
        for registro in resultados
    ]

    # Evitar duplicação dentro da própria consulta.

    unicos = {}

    for registro in organizados:

        unicos[registro["cnpj"]] = registro

    registros = list(unicos.values())

    # 3. Consultar Supabase.

    headers = configurar_supabase()

    cnpjs = [
        registro["cnpj"]
        for registro in registros
    ]

    existentes = consultar_cnpjs_existentes(
        cnpjs,
        headers
    )

    novos = [
        registro
        for registro in registros
        if registro["cnpj"] not in existentes
    ]

    # 4. Mostrar relatório.

    print("\n====================================")
    print("RELATÓRIO")
    print("====================================")

    print("Registros encontrados:", len(resultados))

    print("CNPJs únicos:", len(registros))

    print("Já existentes no Supabase:", len(existentes))

    print("Novos candidatos:", len(novos))

    print("\nDistribuição dos novos candidatos:")

    for cidade in ["montes-claros", "janauba"]:

        quantidade = sum(
            1
            for r in novos
            if r["cidade"] == cidade
        )

        print(f"{cidade}: {quantidade}")

    print("\nPrimeiros candidatos:")

    for registro in novos[:15]:

        print(
            registro.get("nome_fantasia")
            or registro.get("razao_social")
        )

    # 5. Gravar somente quando autorizado.

    if DRY_RUN:

        print("\nSIMULAÇÃO FINALIZADA.")

        print(
            "Nenhum registro foi inserido ou modificado."
        )

        return

    quantidade = inserir_candidatos(
        novos,
        headers
    )

    print("\nIMPORTAÇÃO FINALIZADA.")

    print(
        "Novos registros inseridos:",
        quantidade
    )


if __name__ == "__main__":

    main()
