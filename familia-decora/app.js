// Família Decora — catálogo e orçamento demonstrativo.
// Antes de publicar: configure WHATSAPP da loja e substitua fotos de demonstração pelas fotos autorizadas da empresa.
// O painel local usa o armazenamento deste navegador; para vários funcionários/clientes sincronizarem dados é necessário um backend com autenticação.
const STORE = {
  instagram: "https://www.instagram.com/familiadecora_oficial/",
  whatsapp: "" // Ex.: "5538999999999" (somente números, com 55 + DDD)
};

const SEED = [
  {id:"kit-floral",name:"Kit Pegue e Monte Floral",category:"Kits",tag:"Mais procurado",desc:"Uma composição delicada para celebrar com flores, suportes e detalhes especiais.",img:"https://images.unsplash.com/photo-1519225421980-888cb4c1e12c?auto=format&fit=crop&w=1000&q=85"},
  {id:"mini-table",name:"Mini table romântica",category:"Kits",tag:"Versátil",desc:"Uma proposta charmosa para comemorações intimistas e momentos em família.",img:"https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1000&q=85"},
  {id:"painel",name:"Painéis decorativos",category:"Painéis",tag:"Personalize",desc:"O cenário que dá personalidade à sua festa. Consulte temas e medidas disponíveis.",img:"https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1000&q=85"},
  {id:"cilindros",name:"Trio de cilindros",category:"Móveis",tag:"Combine peças",desc:"Volumes e alturas diferentes para montar uma composição cheia de estilo.",img:"https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1000&q=85"},
  {id:"mesa",name:"Mesa provençal",category:"Móveis",tag:"Clássico",desc:"Uma peça marcante para valorizar o bolo, os doces e a decoração principal.",img:"https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1000&q=85"},
  {id:"pecas",name:"Bandejas e peças avulsas",category:"Peças",tag:"Monte do seu jeito",desc:"Escolha detalhes para complementar a decoração ou criar sua própria composição.",img:"https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1000&q=85"}
];
const PRODUCTS_KEY = "familiaDecora_products_v1";
const ORDERS_KEY = "familiaDecora_orders_demo_v1";
const readStore = (key, fallback) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
let products = readStore(PRODUCTS_KEY, SEED);
if (!localStorage.getItem(PRODUCTS_KEY)) localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
let orders = readStore(ORDERS_KEY, []);
let cart = {};
let activeCategory = "Todos";
let searchText = "";
const money = n => Number(n || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const instagramLink = STORE.instagram;
const app = document.getElementById("app");

function renderSite(){
  document.body.classList.remove("admin-mode");
  app.innerHTML = `
    <div class="topline">Montes Claros • MG &nbsp; | &nbsp; Decoração feita para celebrar o que importa</div>
    <header class="site-header"><div class="nav-wrap">
      <a class="brand" href="#inicio"><span class="brand-mark">❀</span><span class="brand-name">família decora<small>momentos que florescem</small></span></a>
      <nav class="nav-links"><a href="#inicio">Início</a><a href="#catalogo">Catálogo</a><a href="#como-funciona">Como funciona</a><a href="#sobre">Sobre</a></nav>
      <div class="nav-actions"><button class="cart-trigger" id="openCart" aria-label="Abrir orçamento">♡<span class="cart-count" id="cartCount">0</span></button><a class="btn" href="#catalogo">Montar meu orçamento <span>↗</span></a></div>
    </div></header>
    <main>
      <section class="hero" id="inicio"><div class="hero-inner">
        <div><div class="eyebrow">Sua festa, do seu jeitinho</div><h1>Pequenos detalhes.<br><em>Grandes memórias.</em></h1>
          <p class="hero-copy">Encontre peças e kits de decoração para transformar sua comemoração em um momento especial. Escolha seus favoritos e peça um orçamento sem complicação.</p>
          <div class="hero-buttons"><a class="btn" href="#catalogo">Explorar decorações <span>→</span></a><a class="btn btn-outline" href="${instagramLink}" target="_blank" rel="noopener">Ver no Instagram</a></div>
          <div class="hero-note"><span><b>♡</b> Kits e peças para locação</span><span><b>✿</b> Em Montes Claros</span></div>
        </div>
        <div class="hero-art"><div class="hero-photo"><img src="https://images.unsplash.com/photo-1519225421980-888cb4c1e12c?auto=format&fit=crop&w=1200&q=90" alt="Mesa decorada para uma celebração especial"></div>
          <div class="hero-tag"><strong>Seu momento merece</strong><small>uma decoração com carinho em cada detalhe.</small></div><div class="hero-sticker">celebre<br>com amor ✿</div>
        </div>
      </div></section>
      <section class="section" id="catalogo"><div class="section-head"><div class="eyebrow">Inspire-se</div><h2>Encontre a decoração ideal</h2><p>Explore ideias, escolha as peças que combinam com sua comemoração e envie tudo em um único pedido de orçamento.</p></div>
        <div class="catalog-tools"><div class="filters" id="filters"></div><input class="search-field" id="searchProducts" type="search" placeholder="Buscar por tema ou peça..." aria-label="Buscar produtos"></div>
        <div class="product-grid" id="productGrid"></div>
      </section>
      <section class="how" id="como-funciona"><div class="how-inner"><div class="section-head"><div class="eyebrow">É simples assim</div><h2>Da escolha à comemoração</h2><p>Uma experiência prática para você e uma solicitação organizada para a equipe da loja.</p></div>
        <div class="steps"><article class="step"><div class="step-number">01</div><h3>Escolha suas peças</h3><p>Navegue pelo catálogo e adicione kits ou itens avulsos ao seu orçamento.</p></article>
          <article class="step"><div class="step-number">02</div><h3>Conte sobre seu evento</h3><p>Informe a data, o tipo de comemoração e seus dados para facilitar o atendimento.</p></article>
          <article class="step"><div class="step-number">03</div><h3>Receba o retorno</h3><p>Envie sua solicitação pelo canal da loja e confirme disponibilidade, valores e retirada.</p></article></div>
      </div></section>
      <section class="section" id="sobre"><div class="about">
        <div class="about-image"><img src="https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1000&q=85" alt="Detalhes delicados de uma mesa de celebração"></div>
        <div class="about-copy"><div class="eyebrow">Com carinho, Família Decora</div><h2>Celebrar fica ainda mais especial quando tudo tem significado.</h2>
          <p>A Família Decora ajuda a tirar ideias do papel com kits e itens de decoração para festas e encontros especiais. Escolha o que combina com seu momento e converse com a equipe para montar a melhor composição.</p>
          <div class="about-points"><div class="about-point">✿ Kits pegue e monte<span>Praticidade para organizar sua festa.</span></div><div class="about-point">♡ Peças avulsas<span>Liberdade para criar sua composição.</span></div></div>
          <p style="font-size:10px">Atendimento em Montes Claros e região, sujeito à confirmação de disponibilidade.</p>
          <a class="btn" href="${instagramLink}" target="_blank" rel="noopener">Conhecer a loja no Instagram ↗</a>
        </div>
      </div></section>
      <section class="section" style="padding-top:0"><div class="cta"><div><h2>Vamos planejar um momento lindo?</h2><p>Conte sua ideia. A equipe da Família Decora pode ajudar você a encontrar uma composição especial.</p></div><a class="btn" href="#catalogo">Montar orçamento ♡</a></div></section>
    </main>
    <footer class="footer"><div class="footer-inner"><div><a class="brand" href="#inicio"><span class="brand-mark">❀</span><span class="brand-name">família decora<small>momentos que florescem</small></span></a><p>Kits pegue e monte e locação de itens para festas em Montes Claros. Consulte disponibilidade e condições diretamente com a loja.</p></div>
      <div class="footer-links"><a href="#catalogo">Catálogo</a><a href="#como-funciona">Como funciona</a><a href="${instagramLink}" target="_blank" rel="noopener">Instagram ↗</a><a href="?painel=loja">Painel da loja</a></div></div><div class="copyright">© ${new Date().getFullYear()} Família Decora. Todos os direitos reservados.</div></footer>
    <div class="cart-shade" id="cartShade"></div><aside class="cart-panel" id="cartPanel" aria-label="Seu orçamento">
      <div class="cart-head"><h2>Seu orçamento</h2><button class="close-btn" id="closeCart" aria-label="Fechar">×</button></div>
      <div class="cart-content"><div id="cartLines"></div><form class="cart-form" id="requestForm">
        <h3>Sobre sua comemoração</h3>
        <div class="field"><label for="clientName">Seu nome</label><input id="clientName" name="clientName" required placeholder="Como podemos chamar você?"></div>
        <div class="two-fields"><div class="field"><label for="clientPhone">WhatsApp</label><input id="clientPhone" name="clientPhone" required inputmode="tel" placeholder="(38) 99999-9999"></div><div class="field"><label for="eventDate">Data do evento</label><input id="eventDate" name="eventDate" type="date" required></div></div>
        <div class="two-fields"><div class="field"><label for="eventType">Tipo de evento</label><select id="eventType" name="eventType"><option>Aniversário</option><option>Chá de bebê</option><option>Batizado</option><option>Casamento</option><option>Confraternização</option><option>Outro</option></select></div><div class="field"><label for="serviceType">Preferência</label><select id="serviceType" name="serviceType"><option>Pegue e monte / retirada</option><option>Quero consultar montagem</option><option>Ainda não sei</option></select></div></div>
        <div class="field"><label for="eventNotes">Detalhes ou tema (opcional)</label><textarea id="eventNotes" name="eventNotes" rows="2" placeholder="Conte um pouquinho da sua ideia..."></textarea></div>
      </form></div>
      <div class="cart-footer"><button class="btn" id="sendRequest">Enviar pedido de orçamento ↗</button><p class="cart-disclaimer">O envio é uma solicitação, não uma reserva confirmada. Valores, disponibilidade, entrega e montagem serão confirmados pela loja.</p></div>
    </aside>`;
  renderFilters(); renderProducts(); renderCart();
  document.getElementById("openCart").addEventListener("click",openCart);
  document.getElementById("closeCart").addEventListener("click",closeCart);
  document.getElementById("cartShade").addEventListener("click",closeCart);
  document.getElementById("searchProducts").addEventListener("input",e=>{searchText=e.target.value.toLowerCase();renderProducts();});
  document.getElementById("sendRequest").addEventListener("click",submitRequest);
  document.getElementById("eventDate").min=new Date().toISOString().slice(0,10);
}
function renderFilters(){
  const cats=["Todos","Kits","Painéis","Móveis","Peças"];
  document.getElementById("filters").innerHTML=cats.map(c=>`<button class="filter-chip ${activeCategory===c?"active":""}" data-category="${c}">${c}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(btn=>btn.addEventListener("click",()=>{activeCategory=btn.dataset.category;renderFilters();renderProducts();}));
}
function renderProducts(){
  const filtered=products.filter(p=>(activeCategory==="Todos"||p.category===activeCategory)&&[p.name,p.category,p.desc].join(" ").toLowerCase().includes(searchText));
  document.getElementById("productGrid").innerHTML=filtered.length?filtered.map(p=>`
    <article class="product-card"><div class="product-image"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy"><span class="product-tag">${esc(p.tag||p.category)}</span></div>
      <div class="product-info"><div class="product-category">${esc(p.category)}</div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>
        <div class="product-bottom"><span class="price-note">Valor sob consulta</span><button class="add-btn" data-add="${esc(p.id)}">+ Adicionar</button></div></div></article>`).join(""):`<div class="empty-state">Não encontramos itens com esse termo. Experimente outra busca.</div>`;
  document.querySelectorAll("[data-add]").forEach(btn=>btn.addEventListener("click",()=>addToCart(btn.dataset.add)));
}
function addToCart(id){cart[id]=(cart[id]||0)+1;renderCart();openCart();}
function cartItems(){return Object.entries(cart).map(([id,qty])=>({product:products.find(p=>p.id===id),qty})).filter(x=>x.product);}
function renderCart(){
  const items=cartItems();const count=items.reduce((s,x)=>s+x.qty,0);
  const badge=document.getElementById("cartCount");if(badge)badge.textContent=count;
  const lines=document.getElementById("cartLines");if(!lines)return;
  lines.innerHTML=items.length?`<div class="cart-lines">${items.map(({product:p,qty})=>`
    <div class="cart-line"><img src="${esc(p.img)}" alt=""><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small><div class="qty"><button data-qty="${esc(p.id)}" data-delta="-1">−</button><span>${qty}</span><button data-qty="${esc(p.id)}" data-delta="1">+</button></div></div><button class="remove-line" data-remove="${esc(p.id)}" aria-label="Remover">×</button></div>`).join("")}</div>`:`<div class="cart-empty">Seu orçamento ainda está vazio.<br>Adicione kits ou peças do catálogo para começar. ♡</div>`;
  document.querySelectorAll("[data-qty]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.qty;cart[id]=Math.max(0,(cart[id]||0)+Number(b.dataset.delta));if(!cart[id])delete cart[id];renderCart();}));
  document.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{delete cart[b.dataset.remove];renderCart();}));
  const send=document.getElementById("sendRequest");if(send)send.disabled=!items.length;
}
function openCart(){document.getElementById("cartPanel").classList.add("open");document.getElementById("cartShade").classList.add("open");}
function closeCart(){document.getElementById("cartPanel").classList.remove("open");document.getElementById("cartShade").classList.remove("open");}
function submitRequest(){
  const form=document.getElementById("requestForm");if(!form.reportValidity())return;
  const items=cartItems();if(!items.length){alert("Adicione pelo menos um item ao orçamento.");return;}
  const data=new FormData(form);
  const order={id:"FD-"+Date.now().toString().slice(-7),createdAt:new Date().toISOString(),name:data.get("clientName"),phone:data.get("clientPhone"),date:data.get("eventDate"),eventType:data.get("eventType"),service:data.get("serviceType"),notes:data.get("eventNotes"),items:items.map(x=>({name:x.product.name,qty:x.qty}))};
  // Registro de demonstração fica somente neste navegador; o painel não recebe pedidos de outros dispositivos.
  const localOrders=readStore(ORDERS_KEY,[]);localOrders.unshift(order);localStorage.setItem(ORDERS_KEY,JSON.stringify(localOrders));
  const dateLabel=new Date(order.date+"T12:00:00").toLocaleDateString("pt-BR");
  const message=["Olá! Gostaria de solicitar um orçamento com a Família Decora ♡","",`Nome: ${order.name}`,`WhatsApp: ${order.phone}`,`Data do evento: ${dateLabel}`,`Evento: ${order.eventType}`,`Preferência: ${order.service}`,"","Itens:",...order.items.map(i=>`• ${i.qty}x ${i.name}`),order.notes?`Detalhes: ${order.notes}`:"","Pode me informar valores e disponibilidade?"].filter(Boolean).join("\n");
  if(STORE.whatsapp){window.open("https://wa.me/"+STORE.whatsapp.replace(/\D/g,"")+"?text="+encodeURIComponent(message),"_blank","noopener");}
  else{alert("O WhatsApp oficial da loja ainda não foi configurado neste site. Vamos abrir o Instagram para você continuar o atendimento. Seu pedido também foi guardado apenas neste navegador.");window.open(instagramLink,"_blank","noopener");}
}
function renderAdmin(){
  document.body.classList.add("admin-mode");
  app.innerHTML=`<div class="admin-shell"><div class="admin-wrap">
    <div class="admin-top"><div><div class="eyebrow">Família Decora</div><h1>Painel de organização</h1></div><a class="btn btn-outline" href="index.html">← Voltar ao site</a></div>
    <div class="demo-warning"><strong>Modo de demonstração local:</strong> alterações e registros ficam apenas neste navegador/dispositivo. Não há login, banco de dados ou sincronização com pedidos feitos por clientes em outros aparelhos. Não use este painel para guardar dados reais de clientes. Para operação real, vamos conectar um banco de dados e acesso protegido.</div>
    <div class="stats"><div class="stat"><small>Itens no catálogo</small><strong id="statProducts">0</strong></div><div class="stat"><small>Pedidos de teste neste navegador</small><strong id="statOrders">0</strong></div><div class="stat"><small>Solicitações aguardando</small><strong id="statPending">0</strong></div></div>
    <section class="admin-card"><h2>Adicionar item ao catálogo</h2><form id="productForm" class="admin-form">
      <div class="field"><label>Nome do item</label><input name="name" required placeholder="Ex.: Kit jardim encantado"></div>
      <div class="field"><label>Categoria</label><select name="category"><option>Kits</option><option>Painéis</option><option>Móveis</option><option>Peças</option></select></div>
      <div class="field"><label>Etiqueta</label><input name="tag" placeholder="Ex.: Novidade"></div>
      <div class="field"><label>Link da foto</label><input name="img" type="url" placeholder="https://..."></div>
      <div class="field wide"><label>Descrição</label><input name="desc" placeholder="Descreva brevemente o item"></div>
      <div class="wide"><button class="btn" type="submit">Adicionar ao catálogo +</button></div>
    </form></section>
    <section class="admin-card"><h2>Itens cadastrados</h2><div id="adminProducts"></div></section>
    <section class="admin-card"><h2>Pedidos de teste neste navegador</h2><div id="adminOrders"></div><p class="admin-note">Os pedidos enviados por WhatsApp não aparecem automaticamente aqui. Para centralizar pedidos reais, o site precisa de backend conectado.</p><button class="btn btn-outline" id="exportOrders" type="button">Exportar pedidos de teste (CSV)</button></section>
  </div></div>`;
  refreshAdmin();
  document.getElementById("productForm").addEventListener("submit",e=>{
    e.preventDefault();const d=new FormData(e.currentTarget);
    const name=d.get("name").trim();if(!name)return;
    products.push({id:"item-"+Date.now(),name,category:d.get("category"),tag:d.get("tag")||"Novo",img:d.get("img")||"https://images.unsplash.com/photo-1519225421980-888cb4c1e12c?auto=format&fit=crop&w=900&q=80",desc:d.get("desc")||"Consulte detalhes e disponibilidade com a loja."});
    localStorage.setItem(PRODUCTS_KEY,JSON.stringify(products));e.currentTarget.reset();refreshAdmin();
  });
  document.getElementById("exportOrders").addEventListener("click",exportOrders);
}
function refreshAdmin(){
  orders=readStore(ORDERS_KEY,[]);
  document.getElementById("statProducts").textContent=products.length;
  document.getElementById("statOrders").textContent=orders.length;
  document.getElementById("statPending").textContent=orders.filter(o=>(o.status||"Aguardando")!=="Concluído").length;
  document.getElementById("adminProducts").innerHTML=`<table class="admin-table"><thead><tr><th>Item</th><th>Categoria</th><th></th></tr></thead><tbody>${products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td><button data-delete-product="${esc(p.id)}">Excluir</button></td></tr>`).join("")}</tbody></table>`;
  document.querySelectorAll("[data-delete-product]").forEach(b=>b.addEventListener("click",()=>{if(!confirm("Excluir este item do catálogo?"))return;products=products.filter(p=>p.id!==b.dataset.deleteProduct);localStorage.setItem(PRODUCTS_KEY,JSON.stringify(products));refreshAdmin();}));
  document.getElementById("adminOrders").innerHTML=orders.length?`<table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data do evento</th><th>Itens</th><th>Status</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(o.name)}</td><td>${new Date(o.date+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>${o.items.map(i=>esc(i.qty)+"x "+esc(i.name)).join("<br>")}</td><td><select class="status-select" data-status="${esc(o.id)}"><option ${(o.status||"Aguardando")==="Aguardando"?"selected":""}>Aguardando</option><option ${o.status==="Em atendimento"?"selected":""}>Em atendimento</option><option ${o.status==="Concluído"?"selected":""}>Concluído</option></select></td></tr>`).join("")}</tbody></table>`:`<p class="admin-note">Ainda não há pedidos de teste neste navegador. Faça um orçamento pela página pública para visualizar o fluxo.</p>`;
  document.querySelectorAll("[data-status]").forEach(s=>s.addEventListener("change",()=>{const found=orders.find(o=>o.id===s.dataset.status);if(found){found.status=s.value;localStorage.setItem(ORDERS_KEY,JSON.stringify(orders));refreshAdmin();}}));
}
function exportOrders(){
  const rows=[["Pedido","Data","Cliente","WhatsApp","Data do evento","Evento","Preferência","Itens","Status"],...orders.map(o=>[o.id,o.createdAt,o.name,o.phone,o.date,o.eventType,o.service,o.items.map(i=>i.qty+"x "+i.name).join("; " ),o.status||"Aguardando"])];
  const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");
  const blob=new Blob(["\\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="familia-decora-pedidos-demo.csv";a.click();URL.revokeObjectURL(url);
}
if(new URLSearchParams(location.search).get("painel")==="loja")renderAdmin();else renderSite();
