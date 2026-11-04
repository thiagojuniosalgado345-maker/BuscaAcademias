
import os
from collections import defaultdict, Counter

from google.cloud import bigquery
from google.oauth2 import service_account


# ==========================================
# CONFIGURAÇÃO
# ==========================================

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")

GOOGLE_CREDENTIALS_JSON = os.environ.get(
    "GOOGLE_CREDENTIALS_JSON", ""
)

MAX_BYTES = 100 * 1024**3  # Limite de 100 GB por consulta


# ==========================================
# CONSULTA À BASE PÚBLICA DE CNPJs
# ==========================================

SQL = """
SELECT

    cnpj,
    razao_social,
    nome_fantasia,

    endereco.municipio AS cidade,

    endereco.tipo_logradouro AS tipo_logradouro,
    endereco.logradouro AS logradouro,
    endereco.numero AS numero,
    endereco.complemento AS complemento,
    endereco.bairro AS bairro,
    endereco.cep AS cep,

    NULLIF(
        CONCAT(
            COALESCE(telefone1.ddd, ''),
            COALESCE(telefone1.telefone, '')
        ),
        ''
    ) AS telefone,

    cnaes.principal.codigo AS cnae_principal,

    EXISTS (
        SELECT 1
        FROM UNNEST(cnaes.secundarios) AS secundario
        WHERE secundario.codigo = '9313100'
    ) AS possui_cnae_secundario,

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
# AUTENTICAÇÃO
# ==========================================

def conectar_bigquery():

    if not PROJECT_ID:
        raise RuntimeError("GCP_PROJECT_ID não configurado.")

    if not GOOGLE_CREDENTIALS_JSON:
        raise RuntimeError(
            "GOOGLE_CREDENTIALS_JSON não configurado."
        )

    credentials = service_account.Credentials.from_service_account_info(
        __import__("json").loads(GOOGLE_CREDENTIALS_JSON)
    )

    return bigquery.Client(
        project=PROJECT_ID,
        credentials=credentials
    )


# ==========================================
# EXECUTAR CONSULTA
# ==========================================

def consultar_cnpjs():

    client = conectar_bigquery()

    print("Conexão com BigQuery estabelecida.")

    print("Verificando tamanho estimado da consulta...")

    configuracao_teste = bigquery.QueryJobConfig(
        dry_run=True,
        use_query_cache=False
    )

    estimativa = client.query(
        SQL,
        job_config=configuracao_teste
    )

    bytes_estimados = estimativa.total_bytes_processed or 0

    gb_estimados = bytes_estimados / (1024**3)

    print(
        f"Volume estimado: {gb_estimados:.2f} GB"
    )

    if bytes_estimados > MAX_BYTES:

        raise RuntimeError(
            "A consulta ultrapassou o limite de segurança "
            "de 100 GB. Nenhuma consulta de dados foi executada."
        )

    configuracao = bigquery.QueryJobConfig(
        maximum_bytes_billed=MAX_BYTES,
        use_query_cache=True
    )

    print("Executando consulta...")

    job = client.query(
        SQL,
        job_config=configuracao
    )

    resultados = list(job.result())

    print("\nCONSULTA CONCLUÍDA!")

    print("Total de registros:", len(resultados))

    return resultados


# ==========================================
# RELATÓRIO
# ==========================================

def gerar_relatorio(resultados):

    contagem = defaultdict(Counter)

    for registro in resultados:

        cidade = registro["cidade"]

        if registro["cnae_principal"] == "9313100":

            tipo = "CNAE principal"

        else:

            tipo = "CNAE secundário"

        contagem[cidade][tipo] += 1

    print("\n===================================")
    print("RESUMO POR CIDADE")
    print("===================================")

    for cidade, dados in sorted(contagem.items()):

        print(f"\n{cidade}")

        for tipo, quantidade in dados.items():

            print(f"{tipo}: {quantidade}")

    print("\n===================================")
    print("AMOSTRA DE ESTABELECIMENTOS")
    print("===================================")

    for cidade in sorted(contagem.keys()):

        registros_cidade = [
            r for r in resultados
            if r["cidade"] == cidade
            and r["cnae_principal"] == "9313100"
        ]

        print(f"\n--- {cidade} ---")

        for registro in registros_cidade[:10]:

            nome = (
                registro["nome_fantasia"]
                or registro["razao_social"]
            )

            endereco = " ".join(
                str(registro[campo])
                for campo in [
                    "tipo_logradouro",
                    "logradouro",
                    "numero"
                ]
                if registro[campo]
            )

            print(f"\nNome: {nome}")
            print(f"Endereço: {endereco}")
            print(f"Bairro: {registro['bairro']}")
            print(f"CEP: {registro['cep']}")
            print(f"Telefone: {registro['telefone']}")
            print(f"CNPJ: {registro['cnpj']}")

    print("\n===================================")
    print("MODO DE TESTE: NENHUM DADO ALTERADO")
    print("===================================")


# ==========================================
# INÍCIO
# ==========================================

def main():

    resultados = consultar_cnpjs()

    gerar_relatorio(resultados)


if __name__ == "__main__":

    main()
