import csv, json, os, re, unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from collections import Counter
import requests

BASE=Path(__file__).resolve().parents[1]
LEADS=json.loads((BASE/"data/leads-diretorios.json").read_text(encoding="utf-8"))
URL=os.getenv("SUPABASE_URL","").rstrip("/")
KEY=os.getenv("SUPABASE_SECRET_KEY","")
OUT=BASE/"relatorio-cruzamento-diretorios.csv"

def norm(s):
    s=unicodedata.normalize("NFKD",str(s or ""))
    return re.sub(r"[^a-z0-9]","", "".join(c for c in s if not unicodedata.combining(c)).lower())
def num(s):
    m=re.search(r"\b(\d{1,5})\b",str(s or ""))
    return m.group(1) if m else None
def street(s):
    s=norm(re.sub(r"\b\d{1,5}\b.*$","",str(s or "")))
    for p in ("avenida","av","rua","r","travessa","tv","alameda","rodovia","estrada","praca"):
        if s.startswith(p) and len(s)>len(p)+3: return s[len(p):]
    return s
def drafts():
    h={"apikey":KEY,"Authorization":f"Bearer {KEY}"}
    out=[]
    for city in ("montes-claros","janauba"):
        r=requests.get(f"{URL}/rest/v1/academias",headers=h,params={
            "select":"id,nome,cidade,endereco,telefone,cnpj,publicado",
            "cidade":f"eq.{city}","publicado":"eq.false","cnpj":"not.is.null","limit":"2000"},timeout=60)
        r.raise_for_status(); out.extend(r.json())
    return out
def find(lead,items):
    n=num(lead["endereco"]); s=street(lead["endereco"])
    found=[]
    if not n: return "sem_correspondencia",None,0
    for d in items:
        if d.get("cidade")!=lead["cidade"] or num(d.get("endereco"))!=n: continue
        score=SequenceMatcher(None,s,street(d.get("endereco"))).ratio()
        if score>=0.88: found.append((score,d))
    found.sort(key=lambda x:x[0],reverse=True)
    if not found: return "sem_correspondencia",None,0
    if len(found)>1 and found[0][0]-found[1][0]<0.05: return "ambiguo",None,found[0][0]
    return "possivel_correspondencia",found[0][1],found[0][0]
def main():
    if not URL or not KEY: raise RuntimeError("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.")
    current=drafts(); rows=[]
    for lead in LEADS:
        status,d,score=find(lead,current)
        rows.append({"cidade":lead["cidade"],"nome_diretorio":lead["nome"],
        "endereco_diretorio":lead["endereco"],"bairro_diretorio":lead.get("bairro") or "",
        "telefone_diretorio":lead.get("telefone") or "","fonte":lead["fonte"],
        "status_cruzamento":status,"similaridade_endereco":round(score,3),
        "id_rascunho_sugerido":d.get("id","") if d else "",
        "nome_rascunho_sugerido":d.get("nome","") if d else "",
        "telefone_rascunho":d.get("telefone","") if d else "",
        "cnpj_rascunho":d.get("cnpj","") if d else "",
        "acao_recomendada":"REVISAR MANUALMENTE; NAO PUBLICAR"})
    with OUT.open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    print("Leads:",len(LEADS),"| rascunhos:",len(current),"| resultado:",dict(Counter(x["status_cruzamento"] for x in rows)))
    print("Relatório:",OUT.name)
    print("Nenhum dado do Supabase foi alterado; nenhum registro foi publicado.")
if __name__=="__main__": main()
