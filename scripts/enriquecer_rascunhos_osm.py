import os
import re
import time
import unicodedata
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"
CIDADES = {
    "montes-claros": "Montes Claros",
    "janauba": "Janaúba",
}
OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]
session = requests.Session()
session.headers.update({"User-Agent": "BuscaAcademias/1.0 (catalog enrichment)"})


def norm(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", value.lower())


def digits(value):
    return re.sub(r"\D", "", str(value or ""))


def request_supabase(method, table, **kwargs):
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if method == "PATCH":
        headers["Prefer"] = "return=minimal"
    response = session.request(
        method, f"{SUPABASE_URL}/rest/v1/{table}",
        headers=headers, timeout=60, **kwargs
    )
    if not response.ok:
        raise RuntimeError(f"Supabase {response.status_code}: {response.text[:1000]}")
    return response


def fetch_drafts(city):
    response = request_supabase(
        "GET", "academias",
        params={
            "select": "id,nome,cidade,bairro,endereco,telefone,latitude,longitude,site,whatsapp,modalidades,horarios,maps_url,osm_type,osm_id",
            "cidade": f"eq.{city}",
            "publicado": "eq.false",
            "cnpj": "not.is.null",
            "limit": "2000",
        },
    )
    return response.json()


def fetch_osm(city_name):
    query = f"""
    [out:json][timeout:150];
    area["name"="{city_name}"]["boundary"="administrative"]->.a;
    (
      nwr["leisure"="fitness_centre"](area.a);
      nwr["amenity"="gym"](area.a);
      nwr["leisure"="sports_centre"]["sport"~"fitness|gym",i](area.a);
    );
    out center tags;
    """
    errors = []
    for server in OVERPASS_SERVERS:
        try:
            print(f"Consultando OpenStreetMap: {server}")
            response = session.post(server, data={"data": query}, timeout=(20, 180))
            response.raise_for_status()
            data = response.json()
            if data.get("remark"):
                raise RuntimeError(data["remark"])
            return data.get("elements", [])
        except Exception as exc:
            errors.append(f"{server}: {exc}")
            print(f"[AVISO] Servidor Overpass falhou: {exc}")
            time.sleep(5)
    raise RuntimeError("Todos os servidores Overpass falharam: " + " | ".join(errors))


def osm_record(element):
    tags = element.get("tags", {})
    name = tags.get("name")
    center = element.get("center", {})
    lat = element.get("lat", center.get("lat"))
    lon = element.get("lon", center.get("lon"))
    if not name or lat is None or lon is None:
        return None
    street = tags.get("addr:street", "")
    number = tags.get("addr:housenumber", "")
    address = tags.get("addr:full") or (f"{street}, {number}".strip(", ") if street else None)
    phone = tags.get("contact:phone") or tags.get("phone")
    website = tags.get("contact:website") or tags.get("website")
    sports = [x.strip() for x in re.split(r"[;,]", tags.get("sport", "")) if x.strip()]
    hours = tags.get("opening_hours")
    return {
        "name": name, "key": norm(name),
        "osm_type": element["type"], "osm_id": element["id"],
        "bairro": tags.get("addr:suburb") or tags.get("addr:neighbourhood") or tags.get("addr:district"),
        "endereco": address,
        "latitude": float(lat), "longitude": float(lon),
        "telefone": digits(phone) or None,
        "site": website, "modalidades": sports or None,
        "horarios": hours,
        "maps_url": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}",
    }


def main():
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.")

    print("Enriquecimento automático de rascunhos —", "SIMULAÇÃO" if DRY_RUN else "EXECUÇÃO")
    total_matches = total_updates = total_ambiguous = total_unmatched = 0

    for city, city_name in CIDADES.items():
        drafts = fetch_drafts(city)
        print(f"\n{city_name}: {len(drafts)} rascunhos CNPJ para analisar")
        elements = fetch_osm(city_name)
        by_name = {}
        for element in elements:
            item = osm_record(element)
            if item:
                by_name.setdefault(item["key"], []).append(item)

        for draft in drafts:
            matches = by_name.get(norm(draft.get("nome")), [])
            if len(matches) == 0:
                total_unmatched += 1
                continue
            if len(matches) != 1:
                total_ambiguous += 1
                print(f"[REVISÃO] Nome ambíguo: {draft.get('nome')} (ID {draft['id']})")
                continue

            osm = matches[0]
            patch = {
                "osm_type": osm["osm_type"],
                "osm_id": osm["osm_id"],
                "osm_atualizado_em": datetime.now(timezone.utc).isoformat(),
            }
            # Only fill empty fields. Never overwrite existing/manual values.
            for field in ("bairro", "endereco", "latitude", "longitude", "telefone", "site", "modalidades", "horarios", "maps_url"):
                current = draft.get(field)
                incoming = osm.get(field)
                empty = current is None or current == "" or current == []
                if empty and incoming not in (None, "", []):
                    patch[field] = incoming

            if len(patch) == 3:
                continue

            total_matches += 1
            print(f"[{'SIMULAÇÃO' if DRY_RUN else 'ATUALIZAR'}] {draft.get('nome')} — campos: {', '.join(k for k in patch if k not in ('osm_type','osm_id','osm_atualizado_em'))}")
            if not DRY_RUN:
                request_supabase("PATCH", "academias", params={"id": f"eq.{draft['id']}", "publicado": "eq.false"}, json=patch)
                total_updates += 1

        time.sleep(5)

    print("\nRESUMO")
    print("Correspondências únicas com dados novos:", total_matches)
    print("Registros efetivamente atualizados:", total_updates)
    print("Nomes ambíguos para revisão manual:", total_ambiguous)
    print("Sem correspondência no OpenStreetMap:", total_unmatched)
    print("Nenhum rascunho foi publicado automaticamente.")


if __name__ == "__main__":
    main()
