# Família Decora — primeira versão

Projeto criado em uma pasta separada do site BuscaAcademias:
`/familia-decora/`

## O que já funciona nesta versão
- Página responsiva em rosa-claro, branco e detalhes rosé.
- Catálogo demonstrativo com busca e filtros por categoria.
- Carrinho de orçamento com quantidades.
- Formulário com dados básicos do evento e geração de mensagem de orçamento.
- Link para o Instagram informado publicamente como `@familiadecora_oficial`.
- Painel demonstrativo em `?painel=loja`, com cadastro/exclusão de itens, status e exportação CSV de pedidos de teste.

## Antes de divulgar
1. Confirme com a loja se a atividade, endereço, Instagram e serviços descritos continuam corretos.
2. Troque as fotos de demonstração pelas fotos próprias/autorizadas dos kits e peças reais.
3. Edite `STORE.whatsapp` no início de `app.js` com o telefone oficial no formato internacional, somente números (ex.: 5538999999999).
4. Cadastre produtos reais, categorias, regras de retirada/entrega, valores ou política de orçamento.

## Limitações importantes
O painel desta versão é apenas local: usa `localStorage` no navegador atual. Não possui autenticação, banco compartilhado nem sincronização de pedidos entre dispositivos. Os pedidos públicos são enviados pelo WhatsApp quando o número estiver configurado. Para operação de verdade, a próxima etapa é conectar um backend (por exemplo, Supabase), proteger o painel com login e registrar pedidos e disponibilidade em uma base central.

## Publicação
A página está na pasta `familia-decora` do repositório `BuscaAcademias`. Se o GitHub Pages já estiver publicado a partir da branch `main` e da raiz do repositório, a URL esperada é:
`https://thiagojuniosalgado345-maker.github.io/BuscaAcademias/familia-decora/`
