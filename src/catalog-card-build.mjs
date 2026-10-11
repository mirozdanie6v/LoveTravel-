// Keep the existing native renderer; show only formats backed by tour data.
export function correctNativeCardFormats(html) {
  const start=html.indexOf('function card(t, wide=false) {');
  const end=html.indexOf('function priceFacts(',start);
  if(start<0||end<0) throw new Error('Native tour card renderer not found');
  let card=html.slice(start,end);
  const changes=[
    ['${t.city} · индивидуальный / групповой · ${t.duration}', '${[t.city, [t.group ? "групповой" : "", t.individual ? "индивидуальный" : ""].filter(Boolean).join(" / "), t.duration].filter(Boolean).join(" · ")}'],
    ['<div><div class="mini">групповой от</div><div class="price">${groupMin(t)}</div></div>', '${t.group ? `<div><div class="mini">групповой от</div><div class="price">${groupMin(t)}</div></div>` : ""}'],
    ['<div><div class="mini">индивидуальный от</div><div class="price">${indivMin(t)}</div></div>', '${t.individual ? `<div><div class="mini">индивидуальный от</div><div class="price">${indivMin(t)}</div></div>` : ""}'],
  ];
  for(const [before,after] of changes){
    if(card.split(before).length!==2) throw new Error('Native tour card format patch no longer matches');
    card=card.replace(before,after);
  }
  return html.slice(0,start)+card+html.slice(end);
}
