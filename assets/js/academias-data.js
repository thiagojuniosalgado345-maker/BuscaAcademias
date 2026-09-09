/*
  ACADEMIAS_POR_CIDADE — fonte única de verdade das academias.

  Cada academia tem um objeto "horarios" com um item por dia da
  semana (0=domingo, 1=segunda, ... 6=sábado). Se a academia não
  abre naquele dia, o valor é null. Isso é o que permite calcular
  "Aberta agora" / "Fechada agora" automaticamente, comparando com
  a hora atual de quem está vendo o site — sem precisar de ninguém
  atualizar isso manualmente.

  Cada dia pode ter:
  - null                              → fechada o dia todo
  - { abre, fecha }                   → um único período
  - [{ abre, fecha }, { abre, fecha }] → vários períodos (ex: fecha
    pro almoço e reabre à tarde)

  Pra adicionar uma academia nova: copia um objeto existente, muda
  os dados, adiciona no array da cidade certa.
*/

const ACADEMIAS_POR_CIDADE = {

  "montes-claros": [
    {
      nome: "Academia Power",
      bairro: "Centro",
      distancia: "1,2 km",
      foto: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1000&q=80",
      avaliacao: 4.8,
      modalidades: ["Musculação", "Funcional", "Spinning"],
      whatsapp: "",
      detalhesUrl: "academia-power.html",
      mapsUrl: "#",
      horarios: {
        0: null,
        1: { abre: "06:00", fecha: "21:30" },
        2: { abre: "06:00", fecha: "21:30" },
        3: { abre: "06:00", fecha: "21:30" },
        4: { abre: "06:00", fecha: "21:30" },
        5: { abre: "06:00", fecha: "21:30" },
        6: { abre: "08:00", fecha: "12:00" }
      }
    },
    {
      nome: "Fox Trainer",
      bairro: "Delfino Magalhães",
      distancia: "2,1 km",
      foto: "assets/img/images.jpg"
      avaliacao: 4.6,
      modalidades: ["Musculação", "Personal Trainer", "Dança"],
      whatsapp: "",
      detalhesUrl: "fox-trainner.html",
      mapsUrl: "https://maps.apple.com/?address=Av.%20Neco%20Delfino%2C%20228%2C%20Montes%20Claros%2C%20MG",
      horarios: {
        0: { abre: "08:00", fecha: "12:00" },
        1: { abre: "05:00", fecha: "23:00" },
        2: { abre: "05:00", fecha: "23:00" },
        3: { abre: "05:00", fecha: "23:00" },
        4: { abre: "05:00", fecha: "23:00" },
        5: { abre: "05:00", fecha: "23:00" },
        6: [
          { abre: "08:00", fecha: "12:00" },
          { abre: "15:00", fecha: "19:00" }
        ]
      }
    },
    {
      nome: "Sport Fit",
      bairro: "Ibituruna",
      distancia: "3,4 km",
      foto: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1000&q=80",
      avaliacao: 4.5,
      modalidades: ["Musculação", "Funcional", "Pilates"],
      whatsapp: "",
      detalhesUrl: "#",
      mapsUrl: "#",
      horarios: {
        0: null,
        1: { abre: "06:00", fecha: "22:00" },
        2: { abre: "06:00", fecha: "22:00" },
        3: { abre: "06:00", fecha: "22:00" },
        4: { abre: "06:00", fecha: "22:00" },
        5: { abre: "06:00", fecha: "22:00" },
        6: { abre: "08:00", fecha: "12:00" }
      }
    },
    {
      nome: "Studio 360",
      bairro: "Todos os Santos",
      distancia: "2,8 km",
      foto: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1000&q=80",
      avaliacao: 4.4,
      modalidades: ["Funcional", "Cross Training", "Dança"],
      whatsapp: "",
      detalhesUrl: "#",
      mapsUrl: "#",
      horarios: {
        0: null,
        1: { abre: "06:00", fecha: "21:00" },
        2: { abre: "06:00", fecha: "21:00" },
        3: { abre: "06:00", fecha: "21:00" },
        4: { abre: "06:00", fecha: "21:00" },
        5: { abre: "06:00", fecha: "21:00" },
        6: null
      }
    }
  ],

  "janauba": []

};
