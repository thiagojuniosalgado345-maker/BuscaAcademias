#!/usr/bin/env python3
"""Aplica apenas atualizações verificadas ao catálogo, preservando o status de publicação.

A execução faz pré-validação de TODOS os registros antes de escrever qualquer linha.
Campos preenchidos só são substituídos quando o valor atual coincide exatamente
com o valor antigo declarado no arquivo de atualização.
"""
import csv
import json
import os
import re
import unicodedata
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "atualizacoes-verificadas.json"
OUTPUT = ROOT / "relatorio-atualizacoes-verificadas.csv"
URL = os.getenv("SUPABASE_URL", "").strip().replace("\\", "").strip().strip('"').strip("'").rstrip("/")
KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip().replace("\\", "").strip().strip('"').strip("'")
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() != "false"
ALLOWED_FIELDS = {
    "telefone", "whatsapp", "horarios", "modalidades", "instagram", "site",
    "detalhes_url", "estrutura", "categoria", "avaliacao", "numero_avaliacoes",
    "foto", "fotos", "logo", "precos"
}
STATUS_FIELDS = {"aceita_wellhub", "aceita_totalpass"}
SELECT_FIELDS = [
    "id", "nome", "cidade", "bairro", "endereco", "publicado",
    "aceita_wellhub", "aceita_totalpass", "telefone", "whatsapp",
    "horarios", "modalidades", "instagram", "site", "detalhes_url",
    "estrutura", "categoria", "avaliacao", "numero_avaliacoes",
    "foto", "fotos", "logo", "precos", "origem_dados"
]
SESSION = requests.Session()


def headers(prefer=None):
    result = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        result["Prefer"] = prefer
    return result


def normalizar(texto):
    raw = unicodedata.normalize("NFKD", str(texto or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return re.sub(r"[^A-Z0-9]+", " ", raw.upper()).strip()


def digitos(value):
    if value is None:
        return ""
    return re.sub(r"\D", "", str(value).split(".")[0])


def vazio(value):
    return value is None or value == "" or value == [] or value == {}


def iguais(field, left, right):
    if field in {"telefone", "whatsapp"}:
        return digitos(left) == digitos(right)
    return json.dumps(left, ensure_ascii=False, sort_keys=True) == json.dumps(
        right, ensure_ascii=False, sort_keys=True
    )


def validar_ambiente():
    if not URL.startswith(("https://", "http://")) or not KEY:
        raise RuntimeError("SUPABASE_URL ou SUPABASE_SECRET_KEY ausente/inválida.")


def carregar_registros(ids):
    response = SESSION.get(
        f"{URL}/rest/v1/academias",
        headers=headers(),
        params={
            "select": ",".join(SELECT_FIELDS),
            "id": f"in.({','.join(str(int(x)) for x in ids)})",
            "limit": str(max(50, len(ids))),
        },
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError("Falha ao consultar Supabase: " + response.text[:1200])
    rows = response.json()
    return {int(row["id"]): row for row in rows}


def montar_patch(item, row):
    ident = item["id"]
    if row.get("nome") != item["nome"] or row.get("cidade") != item["cidade"]:
        raise RuntimeError(
            f"Identidade divergente no ID {ident}: "
            f"{row.get('nome')} / {row.get('cidade')}."
        )

    expected_address = item.get("endereco_contem", [])
    address = normalizar(row.get("endereco") or "")
    for part in expected_address:
        if normalizar(part) not in address:
            raise RuntimeError(
                f"Endereço não confere no ID {ident} ({row.get('endereco')!r}); "
                "nenhuma atualização será aplicada."
            )

    patch = {}
    report = []

    for field, instruction in item.get("campos", {}).items():
        if field not in ALLOWED_FIELDS:
            raise RuntimeError(f"Campo não autorizado no ID {ident}: {field}")
        mode = instruction["modo"]
        value = instruction.get("valor")
        current = row.get(field)

        if mode == "preencher":
            if vazio(current):
                patch[field] = value
                report.append(f"{field}: preenchido")
            elif iguais(field, current, value):
                report.append(f"{field}: já estava correto")
            else:
                report.append(f"{field}: preservado (já possui valor)")
        elif mode == "substituir_se_igual":
            expected = instruction.get("valor_anterior")
            if iguais(field, current, value):
                report.append(f"{field}: já estava atualizado")
            elif iguais(field, current, expected):
                patch[field] = value
                report.append(f"{field}: corrigido após conferência")
            else:
                raise RuntimeError(
                    f"Valor inesperado no campo {field} do ID {ident}; "
                    "pré-validação interrompida."
                )
        elif mode == "adicionar_lista":
            if not isinstance(value, list):
                raise RuntimeError(f"{field} deve receber uma lista no ID {ident}.")
            current_list = current if isinstance(current, list) else []
            new_list = list(current_list)
            normalized = {normalizar(x) for x in current_list}
            for entry in value:
                if normalizar(entry) not in normalized:
                    new_list.append(entry)
                    normalized.add(normalizar(entry))
            if new_list != current_list:
                patch[field] = new_list
                report.append(f"{field}: itens complementares adicionados")
            else:
                report.append(f"{field}: já estava completo para esta fonte")
        else:
            raise RuntimeError(f"Modo desconhecido {mode!r} no ID {ident}.")

    for field, instruction in item.get("parcerias", {}).items():
        if field not in STATUS_FIELDS:
            raise RuntimeError(f"Campo de parceria não autorizado: {field}")
        current = row.get(field)
        expected = instruction.get("valor_anterior")
        value = instruction.get("valor")
        if current == value:
            report.append(f"{field}: já estava correto")
        elif current == expected:
            patch[field] = value
            report.append(
                f"{field}: atualizado para "
                + ("não confirmado" if value is None else ("sim" if value else "não"))
            )
        else:
            raise RuntimeError(
                f"Status inesperado em {field} no ID {ident}; "
                "pré-validação interrompida."
            )

    source_note = item.get("fonte_e_observacao", "").strip()
    current_source = str(row.get("origem_dados") or "").strip()
    if source_note and source_note not in current_source:
        patch["origem_dados"] = (current_source + " | " + source_note).strip(" |")
        report.append("origem_dados: fonte e observação anexadas")

    return patch, report


def main():
    validar_ambiente()
    items = json.loads(INPUT.read_text(encoding="utf-8"))
    if not isinstance(items, list) or not items:
        raise RuntimeError("O arquivo de atualizações está vazio ou inválido.")
    ids = [int(item["id"]) for item in items]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Há IDs duplicados no arquivo de atualização.")

    current_rows = carregar_registros(ids)
    prepared = []
    csv_rows = []

    # Pré-valida todos os registros antes de qualquer escrita.
    for item in items:
        ident = int(item["id"])
        row = current_rows.get(ident)
        if not row:
            raise RuntimeError(f"ID {ident} não encontrado no Supabase.")
        patch, report = montar_patch(item, row)
        prepared.append((item, row, patch, report))
        csv_rows.append({
            "id": ident,
            "nome": item["nome"],
            "cidade": item["cidade"],
            "publicado_preservado": row.get("publicado"),
            "campos_preparados": "; ".join(report),
            "status": "sem alteração" if not patch else ("simulação" if DRY_RUN else "aguardando gravação"),
        })

    changed = 0
    if not DRY_RUN:
        for item, before, patch, report in prepared:
            if not patch:
                continue
            response = SESSION.patch(
                f"{URL}/rest/v1/academias",
                headers=headers("return=representation"),
                params={"id": f"eq.{int(item['id'])}"},
                json=patch,
                timeout=60,
            )
            if not response.ok:
                raise RuntimeError(
                    f"Erro ao gravar ID {item['id']}: {response.text[:1200]}"
                )
            returned = response.json()
            if len(returned) != 1:
                raise RuntimeError(f"Resposta inesperada ao gravar ID {item['id']}.")
            after = returned[0]
            if after.get("publicado") != before.get("publicado"):
                raise RuntimeError(
                    f"O status de publicação mudou no ID {item['id']}; verifique manualmente."
                )
            for field, value in patch.items():
                if not iguais(field, after.get(field), value):
                    raise RuntimeError(
                        f"Verificação pós-gravação falhou em {field}, ID {item['id']}."
                    )
            changed += 1
            print(f"ID {item['id']} {item['nome']}: atualizado e conferido.")

    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=list(csv_rows[0].keys()))
        writer.writeheader()
        for row in csv_rows:
            if row["status"] == "aguardando gravação":
                row["status"] = "atualizado" if not DRY_RUN else "simulação"
            writer.writerow(row)

    print("Registros pré-validados:", len(items))
    print("Registros efetivamente atualizados:", changed)
    print("Modo:", "SIMULAÇÃO" if DRY_RUN else "GRAVAÇÃO")
    print("Status de publicação preservados em todos os registros.")


if __name__ == "__main__":
    main()
