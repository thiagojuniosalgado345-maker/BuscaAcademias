import csv, os, requests
from pathlib import Path
url=os.getenv("SUPABASE_URL","").strip().rstrip("/")
key=os.getenv("SUPABASE_SECRET_KEY","").strip()
headers={"apikey":key,"Authorization":"Bearer "+key}
params={"select":"id,cidade,nome,bairro,endereco,telefone,whatsapp,instagram,site,horarios,modalidades,aceita_wellhub,aceita_totalpass,publicado,origem_dados,categoria,foto,logo,maps_url,detalhes_url,precos,estrutura,fotos,numero_avaliacoes,avaliacao,latitude,longitude","cidade":"in.(montes-claros,janauba)","order":"cidade.asc,nome.asc","limit":"1000"}
r=requests.get(url+"/rest/v1/academias",headers=headers,params=params,timeout=60)
r.raise_for_status()
rows=r.json()
if len(rows)>=1000: raise RuntimeError("Limite de exportação atingido.")
fields=list(rows[0]) if rows else ["id","cidade","nome"]
with Path("inventario-academias.csv").open("w",newline="",encoding="utf-8-sig") as f:
 w=csv.DictWriter(f,fieldnames=fields); w.writeheader()
 for row in rows: w.writerow({k:str(v) if isinstance(v,(dict,list)) else v for k,v in row.items()})
print("Total:",len(rows),"| publicados:",sum(x.get("publicado") is True for x in rows),"| rascunhos:",sum(x.get("publicado") is False for x in rows))
for city in ("montes-claros","janauba"):
 subset=[x for x in rows if x.get("cidade")==city]
 print(city,len(subset))

# Exportacao usada para conferir a sincronizacao de parceiros em 05/11/2026.
