import csv, os, requests
from pathlib import Path
url=os.getenv("SUPABASE_URL","").strip().rstrip("/")
key=os.getenv("SUPABASE_SECRET_KEY","").strip()
headers={"apikey":key,"Authorization":"Bearer "+key}
params={"select":"id,cnpj,cidade,nome,bairro,endereco,telefone,whatsapp,instagram,site,horarios,modalidades,aceita_wellhub,aceita_totalpass,publicado,origem_dados,categoria,foto,logo,maps_url,detalhes_url,precos,estrutura,fotos,numero_avaliacoes,avaliacao,latitude,longitude","cidade":"in.(montes-claros,janauba)","order":"cidade.asc,nome.asc","limit":"1000"}
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

# Reexportacao de conferência após o último lote de dados.

# Inventário pós-lote de 27 perfis verificados em 05/11/2026.

# Auditoria de inventario apos lote de parcerias e avaliacoes de 05/11/2026.

# Conferência final dos dados públicos, parceiros e rascunhos em 05/11/2026.

# Cruza CNPJs do catálogo com a tabela de candidatas para recuperar nomes fantasia
# sem atribuir uma academia a uma empresa apenas por coincidência de endereço.
cnpjs=sorted({str(x.get("cnpj") or "").strip() for x in rows if x.get("cnpj")})
if cnpjs:
    candidatos=requests.get(
        url+"/rest/v1/academias_candidatas_cnpj",
        headers=headers,
        params={
            "select":"cnpj,nome_fantasia,razao_social,endereco,telefone,categoria_sugerida,status_revisao",
            "cnpj":"in.("+",".join(cnpjs)+")",
            "limit":"1000"
        },
        timeout=60
    )
    candidatos.raise_for_status()
    candidatos_por_cnpj={str(x.get("cnpj") or "").strip():x for x in candidatos.json()}
else:
    candidatos_por_cnpj={}
with Path("correspondencia-nome-fantasia.csv").open("w",newline="",encoding="utf-8-sig") as f:
    campos=["id","cidade","nome_catalogo","cnpj","nome_fantasia","razao_social","endereco_cnpj","telefone_cnpj","categoria_sugerida","status_revisao"]
    w=csv.DictWriter(f,fieldnames=campos);w.writeheader()
    for x in rows:
        cnpj=str(x.get("cnpj") or "").strip()
        c=candidatos_por_cnpj.get(cnpj,{})
        w.writerow({
            "id":x.get("id"),"cidade":x.get("cidade"),"nome_catalogo":x.get("nome"),
            "cnpj":cnpj,"nome_fantasia":c.get("nome_fantasia") or "",
            "razao_social":c.get("razao_social") or "",
            "endereco_cnpj":c.get("endereco") or "",
            "telefone_cnpj":c.get("telefone") or "",
            "categoria_sugerida":c.get("categoria_sugerida") or "",
            "status_revisao":c.get("status_revisao") or ""
        })
print("CNPJs cruzados com nomes fantasia:",len(candidatos_por_cnpj))

# Auditoria final de parceiros Wellhub/TotalPass apos lote 56 registros.

# Auditoria final apos os lotes Wellhub e importacao dos novos parceiros verificados.

# Auditoria final após inclusão de Studio Pedro Sodré e Cross UP e parcerias verificadas.

# Atualizacao de auditoria apos insercao dos registros 230 e 231; nenhuma alteracao no banco.

# Auditoria geral após suspensão temporária da revisão das parcerias Wellhub/TotalPass; foco nos dados cadastrais.

# Auditoria cadastral continua separada da etapa futura de validacao Wellhub/TotalPass.

# Auditoria cadastral independente das verificacoes de parceiros adiadas a pedido do usuario.

# Inventario atualizado apos lotes cadastrais, sem alterar verificacao de parcerias.
