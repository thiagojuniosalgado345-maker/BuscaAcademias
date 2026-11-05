import csv, json, os
from pathlib import Path
import requests

BASE = Path(__file__).resolve().parents[1]
INPUT = BASE / "data" / "enriquecimento-perfis.json"
OUTPUT = BASE / "relatorio-enriquecimento-perfis.csv"
URL = os.getenv("SUPABASE_URL", "").strip().replace("\\", "").strip().strip('"').strip("'").rstrip("/")
KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip().replace("\\", "").strip().strip('"').strip("'")
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"
session = requests.Session()


def headers(prefer=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Accept": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    return h


def validar():
    if not URL.startswith(("https://", "http://")) or not KEY:
        raise RuntimeError("SUPABASE_URL ou SUPABASE_SECRET_KEY ausente/inválida.")


def obter_registros(ids):
    r = session.get(
        f"{URL}/rest/v1/academias",
        headers=headers(),
        params={
            "select": "id,nome,cidade,telefone,horarios,modalidades,detalhes_url,origem_dados,publicado,foto,instagram,site",
            "id": f"in.({','.join(str(x) for x in ids)})",
            "limit": "50",
        },
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError("Erro ao consultar registros: " + r.text[:1200])
    return {int(x["id"]): x for x in r.json()}


def esta_vazio(valor):
    return valor is None or valor == "" or valor == {} or valor == []


def montar_patch(item, atual):
    if atual.get("publicado") is not False:
        raise RuntimeError(f"Registro {item['id']} não está como rascunho; atualização bloqueada.")
    if atual.get("nome") != item["nome"] or atual.get("cidade") != item["cidade"]:
        raise RuntimeError(f"Identidade do registro {item['id']} não confere; atualização bloqueada.")

    patch = {}
    if esta_vazio(atual.get("horarios")):
        patch["horarios"] = item["horarios"]
    if esta_vazio(atual.get("modalidades")) and item.get("modalidades"):
        patch["modalidades"] = item["modalidades"]
    if esta_vazio(atual.get("telefone")) and item.get("telefone"):
        patch["telefone"] = item["telefone"]
    if esta_vazio(atual.get("detalhes_url")):
        patch["detalhes_url"] = item["detalhes_url"]

    origem = str(atual.get("origem_dados") or "").strip()
    nota = item["fonte"]
    if nota not in origem:
        patch["origem_dados"] = (origem + " | " + nota).strip(" |")

    # Não preencher instagram, site, whatsapp ou fotos sem uma fonte
    # específica e verificável da própria unidade.
    return patch


def main():
    validar()
    items = json.loads(INPUT.read_text(encoding="utf-8"))
    atuais = obter_registros([x["id"] for x in items])
    rows, total_updates = [], 0

    for item in items:
        atual = atuais.get(item["id"])
        if not atual:
            raise RuntimeError(f"Registro {item['id']} não encontrado.")
        patch = montar_patch(item, atual)
        status = "sem_alteracao" if not patch else ("simulacao" if DRY_RUN else "atualizado")
        rows.append({
            "id": item["id"], "nome": item["nome"], "cidade": item["cidade"],
            "telefone_atual": atual.get("telefone") or "",
            "horarios_antes": json.dumps(atual.get("horarios"), ensure_ascii=False),
            "horarios_preenchidos": "horarios" in patch,
            "modalidades_preenchidas": "modalidades" in patch,
            "instagram": "não informado; preservado vazio",
            "foto": "não encontrada com URL direta confiável; preservada a imagem padrão",
            "status": status,
        })
        if not patch:
            print(f"ID {item['id']} {item['nome']}: nada a atualizar.")
            continue
        print(f"ID {item['id']} {item['nome']}: campos preparados: {', '.join(patch)}")
        if DRY_RUN:
            continue

        r = session.patch(
            f"{URL}/rest/v1/academias",
            headers=headers("return=representation"),
            params={"id": f"eq.{item['id']}", "publicado": "eq.false"},
            json=patch,
            timeout=60,
        )
        if not r.ok:
            raise RuntimeError(f"Falha ao atualizar ID {item['id']}: " + r.text[:1200])
        retorno = r.json()
        if len(retorno) != 1 or retorno[0].get("publicado") is not False:
            raise RuntimeError(f"Validação pós-atualização falhou para ID {item['id']}.")
        total_updates += 1

    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    print("Registros verificados:", len(items))
    print("Registros atualizados:", total_updates if not DRY_RUN else 0)
    print("Modo:", "SIMULAÇÃO" if DRY_RUN else "ATUALIZAÇÃO")
    if DRY_RUN:
        print("Nenhum dado foi alterado.")
    else:
        print("Todos os registros permaneceram com publicado=false.")


if __name__ == "__main__":
    main()
