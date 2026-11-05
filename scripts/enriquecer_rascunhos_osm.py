import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher

import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"
CIDADES = {"montes-claros": "Montes Claros", "janauba": "Janaúba"}
OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]
session = requests.Session()
session.headers.update({"User-Agent": "BuscaAcademias/1.1 (catalog enrichment)"})


def norm(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", value.lower())


def street_norm(value):
    value = norm(value)
    for prefix in ("avenida", "av", "rua", "r", "travessa", "tv",
                   "alameda", "rodovia", "estrada", "praca"):
        if value.startswith(prefix) and len(value) > len(prefix) + 3:
            return value[len(prefix):]
    return value


def number_in(value):
    match = re.search(r"(?:^|[,;\s])(?:n[ºo.]?\s*)?(\d{1,5})(?:$|[,;\s])", str(value or ""), re.I)
    return match.group(1) if match else None


def request_supabase(method, table, **kwargs):
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if method == "PATCH":
        headers["Prefer"] = "return=minimal"
    response = session.request(method, f"{SUPABASE_URL}/rest/v1/{table}",
                               headers=headers, timeout=60, **kwargs)
    if not response.ok:
        raise RuntimeError(f"Supabase {response.status_code}: {response.text[:1000]}")
    return response


def fetch_drafts(city):
    response = request_supabase(
        "GET", "academias",
        params={
            "select": "id,nome,cidade,bairro,endereco,telefone,latitude,longitude,site,whatsapp,modalidades,horarios,maps_url,osm_type,osm_id",
            "cidade": f"eq.{city}", "publicado": "eq.false",
            "cnpj": "not.is.null", "limit": "2000",
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
    aliases = {
        norm(tags.get(key))
        for key in ("name", "brand", "operator", "short_name",
                    "official_name", "alt_name", "name:pt")
        if tags.get(key)
    }
    aliases.discard("")
    center = element.get("center", {})
    lat, lon = element.get("lat", center.get("lat")), element.get("lon", center.get("lon"))
    if not aliases or lat is None or lon is None:
        return None
    street, number = tags.get("addr:street", ""), tags.get("addr:housenumber", "")
    address = tags.get("addr:full") or (f"{street}, {number}".strip(", ") if street else None)
    phone = tags.get("contact:phone") or tags.get("phone")
    website = tags.get("contact:website") or tags.get("website")
    sports = [x.strip() for x in re.split(r"[;,]", tags.get("sport", "")) if x.strip()]
    return {
        "aliases": aliases,
        "street_key": street_norm(street),
        "house_number": str(number).strip() or None,
        "osm_type": element["type"], "osm_id": element["id"],
        "bairro": tags.get("addr:suburb") or tags.get("addr:neighbourhood") or tags.get("addr:district"),
        "endereco": address, "latitude": float(lat), "longitude": float(lon),
        "telefone": re.sub(r"\D", "", str(phone or "")) or None,
        "site": website, "modalidades": sports or None,
        "horarios": tags.get("opening_hours"),
        "maps_url": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}",
    }


def address_matches(draft, osm):
    address = str(draft.get("endereco") or "")
    draft_number = number_in(address)
    osm_number = osm.get("house_number")
    if not draft_number or not osm_number or draft_number != osm_number:
        return False
    # O endereço precisa conter rua e número. Compara a rua após remover prefixos.
    before_number = re.split(r"[,;]", address, maxsplit=1)[0]
    before_number = re.sub(r"\b(?:n[ºo.]?\s*)?\d{1,5}.*$", "", before_number, flags=re.I)
    street = street_norm(before_number)
    osm_street = osm.get("street_key")
    return bool(street and osm_street and SequenceMatcher(None, street, osm_street).ratio() >= 0.90)


def choose_match(draft, items, used):
    key = norm(draft.get("nome"))
    available = [x for x in items if (x["osm_type"], x["osm_id"]) not in used]
    by_name = [x for x in available if key and key in x["aliases"]]
    by_address = [x for x in available if address_matches(draft, x)]

    if len(by_address) == 1:
        found = by_address[0]
        if len(by_name) == 1 and by_name[0] != found:
            return None, "conflito_nome_endereco"
        return found, "endereco"
    if len(by_address) > 1:
        return None, "endereco_ambiguo"
    if len(by_name) == 1:
        return by_name[0], "nome"
    if len(by_name) > 1:
        return None, "nome_ambiguo"
    return None, "sem_correspondencia"


def main():
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.")

    print("Enriquecimento de rascunhos —", "SIMULAÇÃO" if DRY_RUN else "EXECUÇÃO")
    counts = {"nome": 0, "endereco": 0, "atualizados": 0,
              "ambiguos": 0, "conflitos": 0, "sem_correspondencia": 0,
              "sem_dados_novos": 0}

    for city, city_name in CIDADES.items():
        drafts = fetch_drafts(city)
        print(f"\n{city_name}: {len(drafts)} rascunhos CNPJ para analisar")
        items = [x for element in fetch_osm(city_name) if (x := osm_record(element))]
        print(f"Objetos relevantes encontrados no OpenStreetMap: {len(items)}")
        used = set()

        for draft in drafts:
            osm, method = choose_match(draft, items, used)
            if osm is None:
                if method == "sem_correspondencia":
                    counts["sem_correspondencia"] += 1
                elif method == "conflito_nome_endereco":
                    counts["conflitos"] += 1
                else:
                    counts["ambiguos"] += 1
                print(f"[REVISÃO: {method}] {draft.get('nome')} (ID {draft['id']})")
                continue

            used.add((osm["osm_type"], osm["osm_id"]))
            counts[method] += 1
            patch = {
                "osm_type": osm["osm_type"],
                "osm_id": osm["osm_id"],
                "osm_atualizado_em": datetime.now(timezone.utc).isoformat(),
            }
            for field in ("bairro", "endereco", "latitude", "longitude", "telefone",
                          "site", "modalidades", "horarios", "maps_url"):
                current, incoming = draft.get(field), osm.get(field)
                if (current is None or current == "" or current == []) and incoming not in (None, "", []):
                    patch[field] = incoming

            if len(patch) == 3:
                counts["sem_dados_novos"] += 1
                continue

            fields = ", ".join(k for k in patch if k not in ("osm_type", "osm_id", "osm_atualizado_em"))
            print(f"[{'SIMULAÇÃO' if DRY_RUN else 'ATUALIZAR'}: {method}] {draft.get('nome')} — {fields}")
            if not DRY_RUN:
                request_supabase("PATCH", "academias",
                                 params={"id": f"eq.{draft['id']}", "publicado": "eq.false"},
                                 json=patch)
                counts["atualizados"] += 1

        time.sleep(5)

    print("\nRESUMO")
    print("Correspondências por nome/aliases:", counts["nome"])
    print("Correspondências por endereço (rua + número):", counts["endereco"])
    print("Registros efetivamente atualizados:", counts["atualizados"])
    print("Correspondências ambíguas:", counts["ambiguos"])
    print("Conflitos entre nome e endereço:", counts["conflitos"])
    print("Correspondências sem campos novos:", counts["sem_dados_novos"])
    print("Sem correspondência:", counts["sem_correspondencia"])
    print("Nenhum rascunho foi publicado automaticamente.")


if __name__ == "__main__":
    main()
