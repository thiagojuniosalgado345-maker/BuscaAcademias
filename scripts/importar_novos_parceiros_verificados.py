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
INPUT = BASE / "data" / "novos-parceiros-verificados.json"
OUTPUT = BASE / "relatorio-novos-parceiros.csv"
URL = os.getenv("SUPABASE_URL", "").strip().replace("\\", "").strip().strip('"').strip("'").rstrip("/")
KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip().replace("\\", "").strip().strip('"').strip("'")
TABLE = "academias"
TIMEOUT = 60


def norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", text)


def street(value):
    text = str(value or "").lower()
    text = re.sub(r"\b\d{1,5}\b.*$", "", text)
    text = norm(text)
    for prefix in ("avenida", "av", "rua", "r", "travessa", "tv", "praca", "alameda"):
        if text.startswith(prefix) and len(text) > len(prefix) + 3:
            return text[len(prefix):]
    return text


def number(value):
    match = re.search(r"\b(\d{1,5})\b", str(value or ""))
    return match.group(1) if match else None


def headers(prefer=None):
    value = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        value["Prefer"] = prefer
    return value


def fetch_existing(session):
    existing = []
    for city in ("montes-claros", "janauba"):
        response = session.get(
            f"{URL}/rest/v1/{TABLE}",
            headers=headers(),
            params={
                "select": "id,nome,cidade,endereco,cnpj,publicado",
                "cidade": f"eq.{city}",
                "limit": "2000",
            },
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        existing.extend(response.json())
    return existing


def duplicate_reason(candidate, existing):
    cand_name = norm(candidate["nome"])
    cand_num = number(candidate["endereco"])
    cand_street = street(candidate["endereco"])
    for row in existing:
        if row.get("cidade") != candidate["cidade"]:
            continue
        if norm(row.get("nome")) == cand_name:
            return f"nome já cadastrado (ID {row.get('id')})"
        row_num = number(row.get("endereco"))
        if cand_num and row_num == cand_num:
            score = SequenceMatcher(None, cand_street, street(row.get("endereco"))).ratio()
            if score >= 0.90:
                return f"mesma rua/número provável (ID {row.get('id')}, similaridade {score:.2f})"
    return None


def to_row(candidate):
    query = quote_plus(
        f"{candidate['nome']}, {candidate['endereco']}, "
        f"{'Montes Claros' if candidate['cidade'] == 'montes-claros' else 'Janaúba'}, MG, Brasil"
    )
    row = {
        "nome": candidate["nome"],
        "cidade": candidate["cidade"],
        "bairro": candidate["bairro"],
        "endereco": candidate["endereco"],
        "telefone": candidate["telefone"],
        "whatsapp": None,
        "instagram": candidate.get("instagram"),
        "categoria": candidate["categoria"],
        "detalhes_url": candidate["detalhes_url"],
        "maps_url": f"https://www.google.com/maps/search/?api=1&query={query}",
        "horarios": candidate["horarios"],
        "modalidades": candidate["modalidades"],
        "estrutura": candidate.get("estrutura") or None,
        "avaliacao": candidate.get("avaliacao"),
        "numero_avaliacoes": candidate.get("numero_avaliacoes"),
        "aceita_wellhub": True,
        "aceita_totalpass": candidate.get("aceita_totalpass"),
        "publicado": False,
        "cnpj": None,
        "origem_dados": (
            f"Parceiro confirmado em perfil individual oficial do Wellhub: "
            f"{candidate['detalhes_url']} | dados públicos consultados em 05/11/2026. "
            ("Cadastro inserido como rascunho; TotalPass confirmado." if candidate.get("aceita_totalpass") is True else "Cadastro inserido como rascunho; TotalPass não verificado.")
        ),
    }
    return {key: value for key, value in row.items() if value is not None}


def main():
    if not URL.startswith(("https://", "http://")) or not KEY:
        raise RuntimeError("SUPABASE_URL e SUPABASE_SECRET_KEY devem estar configurados.")
    candidates = json.loads(INPUT.read_text(encoding="utf-8"))
    session = requests.Session()
    existing = fetch_existing(session)
    results = []

    for candidate in candidates:
        reason = duplicate_reason(candidate, existing)
        if reason:
            results.append({
                "nome": candidate["nome"],
                "cidade": candidate["cidade"],
                "status": "ignorado",
                "motivo": reason,
                "id": "",
            })
            print(f"IGNORADO {candidate['nome']}: {reason}")
            continue

        payload = to_row(candidate)
        response = session.post(
            f"{URL}/rest/v1/{TABLE}",
            headers=headers("return=representation"),
            json=payload,
            timeout=TIMEOUT,
        )
        if not response.ok:
            raise RuntimeError(
                f"Erro ao inserir {candidate['nome']}: {response.status_code} "
                f"{response.text[:1000]}"
            )
        returned = response.json()
        if len(returned) != 1:
            raise RuntimeError(f"Retorno inesperado ao inserir {candidate['nome']}.")
        row = returned[0]
        if row.get("publicado") is not False:
            raise RuntimeError(f"{candidate['nome']} não retornou como rascunho.")
        if row.get("aceita_wellhub") is not True:
            raise RuntimeError(f"Wellhub não retornou confirmado em {candidate['nome']}.")
        expected_totalpass = candidate.get("aceita_totalpass")
        if row.get("aceita_totalpass") is not expected_totalpass:
            raise RuntimeError(f"Status TotalPass retornado diferente do validado em {candidate['nome']}.")
        if row.get("cidade") != candidate["cidade"] or norm(row.get("nome")) != norm(candidate["nome"]):
            raise RuntimeError(f"Identidade retornada diferente para {candidate['nome']}.")

        existing.append(row)
        results.append({
            "nome": candidate["nome"],
            "cidade": candidate["cidade"],
            "status": "inserido_como_rascunho",
            "motivo": "perfil individual oficial Wellhub; dados e endereço conferidos",
            "id": row.get("id"),
        })
        print(f"INSERIDO ID {row.get('id')}: {candidate['nome']} (rascunho, Wellhub=true)")

    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=["nome", "cidade", "status", "motivo", "id"])
        writer.writeheader()
        writer.writerows(results)

    inserted = sum(x["status"] == "inserido_como_rascunho" for x in results)
    skipped = len(results) - inserted
    print(f"Total avaliados: {len(results)} | inseridos: {inserted} | ignorados por duplicidade: {skipped}")
    print("Todos os novos registros permanecem publicado=false.")
    print("Nenhum registro existente foi alterado.")


if __name__ == "__main__":
    main()
