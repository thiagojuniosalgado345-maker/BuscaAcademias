import csv, json, os, requests
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]
INPUT=BASE/"data"/"parceiros-confirmados.json"
OUTPUT=BASE/"relatorio-parceiros-confirmados.csv"
URL=os.getenv("SUPABASE_URL","").strip().replace("\\","").strip().strip('"').strip("'").rstrip("/")
KEY=os.getenv("SUPABASE_SECRET_KEY","").strip().replace("\\","").strip().strip('"').strip("'")
DRY_RUN=os.getenv("DRY_RUN","true").strip().lower()=="true"
session=requests.Session()

def headers(prefer=None):
    h={"apikey":KEY,"Authorization":f"Bearer {KEY}","Content-Type":"application/json","Accept":"application/json"}
    if prefer: h["Prefer"]=prefer
    return h

def main():
    if not URL.startswith("https://") or not KEY: raise RuntimeError("Secrets Supabase ausentes ou inválidos.")
    items=json.loads(INPUT.read_text(encoding="utf-8"))
    ids=[str(x["id"]) for x in items]
    r=session.get(f"{URL}/rest/v1/academias",headers=headers(),params={
        "select":"id,nome,cidade,publicado,aceita_wellhub,aceita_totalpass,horarios,modalidades,instagram,detalhes_url,estrutura,origem_dados",
        "id":f"in.({','.join(ids)})","limit":"100"
    },timeout=60)
    r.raise_for_status()
    atual={int(x["id"]):x for x in r.json()}
    linhas=[]
    for item in items:
        row=atual.get(item["id"])
        if not row: raise RuntimeError(f"ID {item['id']} não encontrado.")
        if row["nome"]!=item["nome"] or row["cidade"]!=item["cidade"]:
            raise RuntimeError(f"Identidade divergente no ID {item['id']}; interrompido.")
        patch={}
        if item.get("aceita_wellhub") is True and row.get("aceita_wellhub") is not True:
            patch["aceita_wellhub"]=True
        if item.get("aceita_totalpass") is True and row.get("aceita_totalpass") is not True:
            patch["aceita_totalpass"]=True
        for field in ("horarios","modalidades","instagram","detalhes_url","estrutura","categoria","maps_url"):
            proposed=item.get(field)
            existing=row.get(field)
            empty=existing is None or existing=="" or existing=={} or existing==[]
            if proposed is not None and empty:
                patch[field]=proposed
        note="Fonte verificada em 05/11/2026: "+item.get("fonte","")
        if item.get("observacao"): note+=". "+item["observacao"]
        origin=str(row.get("origem_dados") or "")
        if note not in origin:
            patch["origem_dados"]=(origin+" | "+note).strip(" |")
        if row.get("publicado") is True:
            # Public profiles may receive verified details, but publication state is immutable.
            pass
        if "publicado" in patch: raise RuntimeError("Script não pode alterar publicação.")
        status="sem_alteracao" if not patch else ("simulacao" if DRY_RUN else "atualizado")
        linhas.append({
            "id":item["id"],"nome":item["nome"],"cidade":item["cidade"],
            "wellhub":item.get("aceita_wellhub","não confirmado"),
            "totalpass":item.get("aceita_totalpass","não confirmado"),
            "campos_preparados":",".join(patch.keys()),"publicado_antes":row["publicado"],"status":status
        })
        if not patch or DRY_RUN: continue
        q=session.patch(f"{URL}/rest/v1/academias",headers=headers("return=representation"),
             params={"id":f"eq.{item['id']}"},json=patch,timeout=60)
        q.raise_for_status()
        data=q.json()
        if len(data)!=1 or data[0].get("publicado")!=row.get("publicado"):
            raise RuntimeError(f"Validação de atualização falhou no ID {item['id']}.")
    with OUTPUT.open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=list(linhas[0]));w.writeheader();w.writerows(linhas)
    print("Estabelecimentos conferidos:",len(items))
    print("Parcerias Wellhub confirmadas:",sum(x.get("aceita_wellhub") is True for x in items))
    print("Parcerias TotalPass confirmadas:",sum(x.get("aceita_totalpass") is True for x in items))
    print("Modo:", "SIMULAÇÃO" if DRY_RUN else "ATUALIZAÇÃO")
    print("Registros atualizados:",sum(x["status"]=="atualizado" for x in linhas))
    print("Nenhum status de publicação foi alterado." if DRY_RUN else "Conferência de publicado concluída para cada registro.")
if __name__=="__main__": main()
