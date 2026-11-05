import csv
import json
import os
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import quote_plus

import requests

BASE = Path(__file__).resolve().parents[1]
INPUT = BASE / "data" / "leads-verificados.json"
OUTPUT = BASE / "relatorio-importacao-leads-verificados.csv"
URL = os.getenv("SUPABASE_URL", "").strip().replace("\\", "").strip().strip('"').strip("'").rstrip("/")
KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip().replace("\\", "").strip().strip('"').strip("'")
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"
CIDADES = ("montes-claros", "janauba")
session = requests.Session()


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", texto)


def numero(endereco):
    encontrados = re.findall(r"\b\d{1,5}[a-zA-Z]?\b", str(endereco or ""))
    return normalizar(encontrados[-1]) if encontrados else ""


def rua(endereco):
    texto = str(endereco or "")
    texto = re.sub(r"\b\d{1,5}[a-zA-Z]?\b.*$", "", texto)
    texto = normalizar(texto)
    for prefixo in ("avenida", "av", "rua", "r", "praca", "travessa", "tv"):
        if texto.startswith(prefixo) and len(texto) > len(prefixo) + 3:
            return texto[len(prefixo):]
    return texto


def endereco_compativel(a, b):
    na, nb = numero(a), numero(b)
    if not na or not nb or na != nb:
        return False
    return SequenceMatcher(None, rua(a), rua(b)).ratio() >= 0.88


def telefone_compativel(a, b):
    a = re.sub(r"\D", "", str(a or ""))
    b = re.sub(r"\D", "", str(b or ""))
    if not a or not b:
        return False
    return a == b or (len(a) >= 10 and len(b) >= 10 and a[-10:] == b[-10:])


def validar_configuracao():
    if not URL.startswith(("https://", "http://")):
        raise RuntimeError("SUPABASE_URL ausente ou inválida.")
    if not KEY:
        raise RuntimeError("SUPABASE_SECRET_KEY ausente.")


def headers(prefer=None):
    h = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def buscar_registros_existentes():
    registros = []
    for cidade in CIDADES:
        r = session.get(
            f"{URL}/rest/v1/academias",
            headers=headers(),
            params={
                "select": "id,nome,cidade,endereco,telefone,whatsapp,publicado,cnpj",
                "cidade": f"eq.{cidade}",
                "limit": "2000",
            },
            timeout=60,
        )
        if not r.ok:
            raise RuntimeError("Falha ao consultar academias: " + r.text[:1200])
        lote = r.json()
        if len(lote) >= 2000:
            raise RuntimeError(f"Consulta de {cidade} atingiu 2.000 linhas; interrompida para evitar análise incompleta.")
        registros.extend(lote)
    return registros


def validar_lead(lead):
    obrigatorios = ("cidade", "nome", "endereco", "telefone", "categoria", "fonte")
    for campo in obrigatorios:
        if not str(lead.get(campo) or "").strip():
            raise ValueError(f"Campo obrigatório ausente: {campo}")
    if lead["cidade"] not in CIDADES:
        raise ValueError("Cidade fora da lista permitida.")
    telefone = re.sub(r"\D", "", str(lead["telefone"]))
    if len(telefone) not in (10, 11):
        raise ValueError(f"Telefone inválido para {lead['nome']}: {telefone}")
    if lead.get("categoria") not in ("Academia", "Centro de treinamento"):
        raise ValueError(f"Categoria não permitida: {lead.get('categoria')}")


def classificar(lead, existentes):
    nome_n = normalizar(lead["nome"])
    for atual in existentes:
        if atual.get("cidade") != lead["cidade"]:
            continue
        existente_n = normalizar(atual.get("nome"))
        similaridade_nome = SequenceMatcher(None, nome_n, existente_n).ratio()
        if nome_n and (nome_n in existente_n or existente_n in nome_n or similaridade_nome >= 0.90):
            return "duplicado_nome", atual, "Nome muito semelhante a registro existente."
        if telefone_compativel(lead.get("telefone"), atual.get("telefone")) or telefone_compativel(lead.get("telefone"), atual.get("whatsapp")):
            return "possivel_duplicado_telefone", atual, "Telefone coincide com registro existente."
        if endereco_compativel(lead.get("endereco"), atual.get("endereco")):
            return "revisar_endereco", atual, "Mesmo logradouro e número; pode haver outra unidade ou ocupante no local."
    return "novo_rascunho", None, "Sem duplicidade por nome, telefone ou endereço detectável."


def transformar(lead):
    cidade_nome = "Montes Claros" if lead["cidade"] == "montes-claros" else "Janaúba"
    consulta = quote_plus(f'{lead["nome"]}, {lead["endereco"]}, {cidade_nome}, MG, Brasil')
    return {
        "nome": lead["nome"],
        "cidade": lead["cidade"],
        "bairro": lead.get("bairro"),
        "endereco": lead["endereco"],
        "telefone": re.sub(r"\D", "", lead["telefone"]),
        "categoria": lead["categoria"],
        "modalidades": [],
        "maps_url": "https://www.google.com/maps/search/?api=1&query=" + consulta,
        "origem_dados": "Diretório público verificado; cadastro pendente de confirmação pelo estabelecimento",
        "publicado": False,
    }


def inserir(registros):
    inseridos = 0
    for inicio in range(0, len(registros), 25):
        lote = registros[inicio:inicio + 25]
        r = session.post(
            f"{URL}/rest/v1/academias",
            headers=headers("return=representation"),
            json=lote,
            timeout=60,
        )
        if not r.ok:
            raise RuntimeError("Falha ao inserir rascunhos: " + r.text[:1500])
        retornados = r.json()
        if len(retornados) != len(lote) or any(x.get("publicado") is not False for x in retornados):
            raise RuntimeError("Validação pós-inserção falhou; conferir o lote no Supabase.")
        inseridos += len(retornados)
    return inseridos


# Reconsulta o catálogo inteiro antes da inserção para evitar duplicatas.
# Os registros novos entram exclusivamente como rascunhos.

def main():
    validar_configuracao()
    leads = json.loads(INPUT.read_text(encoding="utf-8"))
    existentes = buscar_registros_existentes()
    linhas, novos = [], []

    for lead in leads:
        validar_lead(lead)
        status, atual, motivo = classificar(lead, existentes)
        linhas.append({
            "cidade": lead["cidade"],
            "nome": lead["nome"],
            "endereco": lead["endereco"],
            "telefone": lead["telefone"],
            "fonte": lead["fonte"],
            "status": status,
            "id_existente": atual.get("id", "") if atual else "",
            "nome_existente": atual.get("nome", "") if atual else "",
            "publicado_existente": atual.get("publicado", "") if atual else "",
            "motivo": motivo,
        })
        if status == "novo_rascunho":
            novos.append(transformar(lead))

    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(linhas[0]))
        writer.writeheader()
        writer.writerows(linhas)

    print("Leads analisados:", len(leads))
    print("Registros consultados:", len(existentes))
    print("Novos rascunhos seguros:", len(novos))
    print("Casos para revisar:", sum(x["status"] != "novo_rascunho" for x in linhas))
    print("Modo:", "SIMULAÇÃO" if DRY_RUN else "IMPORTAÇÃO")
    if DRY_RUN:
        print("Nenhuma linha foi inserida ou alterada.")
        return

    total = inserir(novos)
    print("Rascunhos inseridos:", total)
    print("Todos os novos registros estão com publicado=false.")


if __name__ == "__main__":
    main()
