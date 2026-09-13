/* ===================== utilidades ===================== */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt1 = n => n>=100 ? n.toFixed(0) : n.toFixed(1);
const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
const hora = () => new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});

async function getJSON(url, ms=9000, headers={}){
  const r = await fetch(url, {signal: AbortSignal.timeout(ms), cache:"no-store", headers});
  if (!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}
async function copyText(txt, btn, okLabel="Copiado"){
  try { await navigator.clipboard.writeText(txt); }
  catch { const ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  if (btn){ const old=btn.textContent; btn.textContent=okLabel; btn.classList.add("ok"); setTimeout(()=>{btn.textContent=old; btn.classList.remove("ok");},1300); }
}
const isIPv4 = s => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
const isIPv6 = s => /^[0-9a-f:]+$/i.test(s) && s.includes(":") && s.split("::").length<=2 && s.split(":").length<=8 && s.split(":").every(p=>p.length<=4);
const isIP = s => isIPv4(s) || isIPv6(s);
const isDomain = s => /^(?=.{1,253}$)([a-z0-9_](-*[a-z0-9_])*\.)+[a-z]{2,63}$/i.test(s);

function rowsHTML(pairs, prefix){
  return `<div class="rows">${pairs.filter(([,v])=>v!==undefined && v!==null && v!=="").map(([k,v,mono],i)=>`
    <div class="row"><div class="k">${esc(k)}</div><div class="v ${mono?'mono':''}" id="${prefix}-${i}">${esc(v)}</div><button class="copy" data-copy="${prefix}-${i}">Copiar</button></div>`).join("")}</div>`;
}
function copyAllBtn(fn, label="Copiar todo"){ const id="ca"+Math.random().toString(36).slice(2,7); setTimeout(()=>{ const b=$(id); if(b) b.onclick=()=>copyText(fn(), b, "Todo copiado"); }); return `<button class="allbtn sec" id="${id}" style="margin-top:10px">${label}</button>`; }
function pairsToText(title, pairs){ return title+"\n"+pairs.filter(([,v])=>v).map(([k,v])=>`  ${k}: ${v}`).join("\n"); }

/* ===================== datos de IP ===================== */
const S = { ip4:null, ip6:null, info:{v4:null, v6:null}, tab:"v4", map:null, marker:null, circle:null, arg:null, current:"home" };
const FIELDS = [["ip","Dirección IP"],["tipo","Tipo"],["city","Ciudad"],["region","Estado / Región"],["country","País"],["continent","Continente"],["postal","Código postal"],["timezone","Zona horaria"],["hora","Hora local"],["isp","Proveedor (ISP)"],["org","Organización"],["asn","ASN"],["coords","Coordenadas"],["flag","Bandera"]];

async function fetchIP4(){
  try { return (await getJSON("https://api.ipify.org?format=json")).ip; } catch {}
  try { const t = await (await fetch("https://ipv4.icanhazip.com",{cache:"no-store",signal:AbortSignal.timeout(6000)})).text(); if (isIPv4(t.trim())) return t.trim(); } catch {}
  return null;
}
async function fetchIP6(){
  try { const ip = (await getJSON("https://api6.ipify.org?format=json", 6000)).ip; if (ip && ip.includes(":")) return ip; } catch {}
  try { const ip = (await getJSON("https://api64.ipify.org?format=json", 6000)).ip; if (ip && ip.includes(":")) return ip; } catch {}
  return null;
}
function normWho(d){
  const tzHora = d.timezone?.id ? new Date().toLocaleTimeString("es-CL",{timeZone:d.timezone.id,hour:"2-digit",minute:"2-digit"}) : "—";
  return { ip:d.ip, tipo:d.type, city:d.city, region:d.region, country:`${d.country} (${d.country_code})`, continent:d.continent, postal:d.postal||"—",
    timezone: d.timezone ? `${d.timezone.id} (UTC${d.timezone.utc})` : "—", hora:tzHora,
    isp:d.connection?.isp||"—", org:d.connection?.org||"—", asn: d.connection?.asn ? `AS${d.connection.asn}` : "—", asnNum:d.connection?.asn||null,
    lat:d.latitude, lon:d.longitude, coords:`${d.latitude}, ${d.longitude}`, flag:d.flag?.emoji||"" };
}
function normApi(d){
  return { ip:d.ip, tipo:d.version, city:d.city, region:d.region, country:`${d.country_name} (${d.country_code})`, continent:d.continent_code, postal:d.postal||"—",
    timezone: d.timezone ? `${d.timezone} (UTC${d.utc_offset||""})` : "—", hora: d.timezone ? new Date().toLocaleTimeString("es-CL",{timeZone:d.timezone,hour:"2-digit",minute:"2-digit"}) : "—",
    isp:d.org||"—", org:d.org||"—", asn:d.asn||"—", asnNum:(d.asn||"").replace("AS","")||null,
    lat:d.latitude, lon:d.longitude, coords:`${d.latitude}, ${d.longitude}`, flag:"" };
}
async function fetchInfo(ip){
  try { const d = await getJSON(`https://ipwho.is/${ip}`); if (d.success!==false) return normWho(d); } catch {}
  try { const d = await getJSON(`https://ipapi.co/${ip}/json/`); if (!d.error) return normApi(d); } catch {}
  return null;
}
function infoText(label, i){ return pairsToText(`Detalles ${label}:`, FIELDS.map(([k,l])=>[l, i[k]])); }

function drawMap(containerId, info){
  if (!info || info.lat==null || !$(containerId)) return;
  if (S.map && S.map._container.id!==containerId){ S.map.remove(); S.map=null; }
  if (!S.map){
    S.map = L.map(containerId, {zoomControl:false}).setView([info.lat, info.lon], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenStreetMap"}).addTo(S.map);
    L.control.zoom({position:"bottomright"}).addTo(S.map);
  } else S.map.setView([info.lat, info.lon], 10);
  if (S.marker) S.marker.remove(); if (S.circle) S.circle.remove();
  S.marker = L.circleMarker([info.lat, info.lon], {radius:9, color:"#4fd1c5", fillColor:"#4fd1c5", fillOpacity:.5}).addTo(S.map).bindPopup(`${esc(info.city)}, ${esc(info.region)}<br>${esc(info.country)}`).openPopup();
  S.circle = L.circle([info.lat, info.lon], {radius:15000, color:"#4fd1c5", weight:1, fillOpacity:.06}).addTo(S.map);
}

/* ===================== herramientas ===================== */
const TOOLS = [
  {id:"miip", ic:"📍", nombre:"Mi IP", desc:"IPv4/IPv6 pública, ubicación, ISP, ASN y mapa."},
  {id:"velocidad", ic:"⚡", nombre:"Prueba de velocidad", desc:"Descarga, carga, latencia y jitter en vivo."},
  {id:"lookup", ic:"🔎", nombre:"Consultar IP", desc:"Ubicación, ISP y red de cualquier IP pública."},
  {id:"whois", ic:"📄", nombre:"WHOIS de IP", desc:"Titular, rango, registro y contacto de abuso (RDAP)."},
  {id:"asn", ic:"🕸️", nombre:"Consultar ASN", desc:"Organización, país y prefijos anunciados."},
  {id:"dns", ic:"🧭", nombre:"Consulta DNS", desc:"A, AAAA, MX, NS, TXT, CNAME, SOA, CAA…"},
  {id:"rdns", ic:"🔁", nombre:"DNS inverso", desc:"Hostname (PTR) detrás de una IP."},
  {id:"email", ic:"✉️", nombre:"Correo del dominio", desc:"MX, SPF, DMARC y DKIM."},
  {id:"dnsbl", ic:"🛡️", nombre:"Listas negras", desc:"¿Está la IP en listas de spam (DNSBL)?"},
  {id:"verificar", ic:"🧪", nombre:"Analizar IP", desc:"Pública, privada o especial; binario, hex, decimal."},
  {id:"subred", ic:"🧮", nombre:"Calculadora de subred", desc:"CIDR: red, broadcast, máscara y hosts."},
  {id:"random", ic:"🎲", nombre:"IP aleatoria", desc:"Genera IPv4 o IPv6 de prueba."},
  {id:"router", ic:"📶", nombre:"IP del router", desc:"Puerta de enlace por marca y cómo hallarla."},
  {id:"conexion", ic:"💻", nombre:"Mi conexión", desc:"HTTP/TLS, nodo, navegador, dispositivo y ping."},
];
const T = {};

/* ---- Inicio ---- */
function heroSub(){ const i=S.info.v4||S.info.v6; return i ? `${i.flag} ${i.city}, ${i.country} · ${i.isp}` : ((S.ip4||S.ip6) ? "Sin detalles" : "Consultando…"); }
T.home = {
  titulo:"Mi IP",
  render(){
    return `<div class="card hero" data-go="miip" style="cursor:pointer"><h2>Tu IP pública <span class="sub">ver detalles ›</span></h2><div class="big" id="h-ip">${S.ip4||S.ip6||'<div class="skeleton"></div>'}</div><div class="small" id="h-sub">${heroSub()}</div></div>
      <div class="grid">${TOOLS.map(t=>`<div class="tool" data-go="${t.id}"><div class="ic">${t.ic}</div><b>${t.nombre}</b><span>${t.desc}</span></div>`).join("")}</div>`;
  },
  async init(){ if (!S.ip4 && !S.ip6) await loadMyIP(); const h=$("h-ip"); if(h){ h.textContent=S.ip4||S.ip6||"No disponible"; $("h-sub").textContent=heroSub(); } }
};
async function loadMyIP(){
  const [ip4, ip6] = await Promise.all([fetchIP4(), fetchIP6()]);
  S.ip4 = ip4; S.ip6 = ip6;
  const [i4, i6] = await Promise.all([ip4 ? fetchInfo(ip4) : null, ip6 ? fetchInfo(ip6) : null]);
  S.info = {v4:i4, v6:i6};
}

/* ---- Mi IP ---- */
T.miip = {
  titulo:"Mi IP",
  render(){
    return `<div class="card"><h2>IPv4 pública</h2><div class="ipbox"><div class="ipval v4" id="ip4"><div class="skeleton"></div></div><button class="copy" data-copy="ip4">Copiar</button></div></div>
      <div class="card"><h2>IPv6 pública</h2><div class="ipbox"><div class="ipval v6" id="ip6"><div class="skeleton"></div></div><button class="copy" data-copy="ip6">Copiar</button></div></div>
      <div class="card"><h2>Detalles <span class="tabs" id="tabs"><button class="tab ${S.tab==='v4'?'on':''}" data-t="v4">IPv4</button><button class="tab ${S.tab==='v6'?'on':''}" data-t="v6">IPv6</button></span></h2><div id="rows"></div></div>
      <div class="card"><h2>Ubicación aproximada</h2><div class="map" id="map"></div><div class="status" style="margin-top:8px">Fiable a nivel de país; a nivel de ciudad suele reflejar el nodo del proveedor.</div></div>
      <div class="card"><h2>Más sobre mi IP</h2><div class="chips" id="more"></div></div>
      <button class="allbtn" id="copyall">Copiar todo</button><div class="status" id="status"></div>`;
  },
  async init(force){
    const paint = () => {
      const set=(id,ip,none)=>{ const el=$(id); if(!el) return; if(ip){ el.textContent=ip; el.classList.remove("none"); } else { el.textContent=none; el.classList.add("none"); } };
      set("ip4", S.ip4, "No disponible"); set("ip6", S.ip6, "Sin IPv6 pública en esta red");
      const info=S.info[S.tab], rows=$("rows"); if(!rows) return;
      rows.innerHTML = info ? rowsHTML(FIELDS.map(([k,l])=>[l, info[k]]), "f") : `<div class="status" style="padding:12px 0">${(S.tab==="v4"?S.ip4:S.ip6) ? "Sin detalles disponibles." : "Tu red no expone una IPv6 pública."}</div>`;
      drawMap("map", S.info[S.tab] || S.info.v4 || S.info.v6);
      const ip = S.ip4||S.ip6, i = S.info.v4||S.info.v6;
      $("more").innerHTML = ip ? `<span class="chip" data-go="whois" data-arg="${esc(ip)}">WHOIS</span>${i?.asnNum?`<span class="chip" data-go="asn" data-arg="${esc(i.asnNum)}">ASN ${esc(i.asnNum)}</span>`:""}<span class="chip" data-go="rdns" data-arg="${esc(ip)}">DNS inverso</span>${S.ip4?`<span class="chip" data-go="dnsbl" data-arg="${esc(S.ip4)}">Listas negras</span>`:""}<span class="chip" data-go="verificar" data-arg="${esc(ip)}">Analizar</span>` : "";
    };
    $("tabs").onclick = e => { const t=e.target.closest(".tab"); if(!t) return; S.tab=t.dataset.t; document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("on",x===t)); paint(); };
    $("copyall").onclick = e => copyText(myIPText(), e.target, "Todo copiado");
    if (force || (!S.ip4 && !S.ip6)){ $("status").textContent="Consultando…"; await loadMyIP(); }
    paint(); $("status").textContent = (S.ip4||S.ip6) ? "Actualizado "+hora() : "No se pudo consultar la IP. Revisa tu conexión.";
  }
};
function myIPText(){
  let s = `IPv4: ${S.ip4||"—"}\nIPv6: ${S.ip6||"—"}`;
  if (S.info.v4) s += "\n\n"+infoText("IPv4", S.info.v4);
  if (S.info.v6) s += "\n\n"+infoText("IPv6", S.info.v6);
  return s;
}

/* ---- Consultar IP ---- */
T.lookup = {
  titulo:"Consultar IP",
  render(){ return `<div class="card"><h2>Dirección IP pública</h2><div class="inrow"><input id="q" placeholder="8.8.8.8 o 2606:4700::1111" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">Consultar</button></div>
    <div class="chips"><span class="chip" data-q="8.8.8.8">Google DNS</span><span class="chip" data-q="1.1.1.1">Cloudflare</span><span class="chip" data-q="208.67.222.222">OpenDNS</span><span class="chip" data-q="9.9.9.9">Quad9</span><span class="chip" data-q="2606:4700:4700::1111">Cloudflare v6</span>${S.ip4?`<span class="chip" data-q="${S.ip4}">Mi IP</span>`:""}</div></div>
    <div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    if(!isIP(q)) throw new Error("Ingresa una dirección IPv4 o IPv6 válida.");
    const i = await fetchInfo(q); if(!i) throw new Error("No se obtuvo información para esa IP.");
    const pairs = FIELDS.map(([k,l])=>[l,i[k]]);
    $("out").innerHTML = `<div class="card"><h2>Resultado <span class="sub">${esc(q)}</span></h2>${rowsHTML(pairs,"l")}${copyAllBtn(()=>pairsToText("IP "+q, pairs))}</div>
      <div class="card"><h2>Mapa</h2><div class="map" id="map2"></div></div>
      <div class="card"><h2>Más sobre esta IP</h2><div class="chips"><span class="chip" data-go="whois" data-arg="${esc(q)}">WHOIS</span>${i.asnNum?`<span class="chip" data-go="asn" data-arg="${esc(i.asnNum)}">ASN ${esc(i.asnNum)}</span>`:""}<span class="chip" data-go="rdns" data-arg="${esc(q)}">DNS inverso</span>${isIPv4(q)?`<span class="chip" data-go="dnsbl" data-arg="${esc(q)}">Listas negras</span>`:""}<span class="chip" data-go="verificar" data-arg="${esc(q)}">Analizar</span></div></div>`;
    drawMap("map2", i);
  }); }
};
function wireQuery(handler){
  const run = async () => {
    const q = $("q").value.trim(); if(!q) return;
    $("out").innerHTML = `<div class="status" style="padding:10px 0">Consultando…</div>`;
    try { await handler(q); } catch(e){ $("out").innerHTML = `<div class="status err" style="padding:10px 0">${esc(e.message)}</div>`; }
  };
  $("go").onclick = run; $("q").onkeydown = e => { if(e.key==="Enter"){ e.preventDefault(); $("q").blur(); run(); } };
  document.querySelectorAll(".chip[data-q]").forEach(c=>c.onclick=()=>{ $("q").value=c.dataset.q; run(); });
  if (S.arg){ $("q").value = S.arg; S.arg=null; run(); }
}

/* ---- WHOIS (RDAP) ---- */
function vcardGet(vc, key){ const f=(vc?.[1]||[]).find(x=>x[0]===key); return f ? (Array.isArray(f[3])?f[3].filter(Boolean).join(", "):f[3]) : null; }
function entitiesFlat(ents, out=[], depth=0){
  (ents||[]).forEach(e=>{ out.push({roles:(e.roles||[]).join(", "), handle:e.handle, nombre:vcardGet(e.vcardArray,"fn"), email:vcardGet(e.vcardArray,"email"), tel:vcardGet(e.vcardArray,"tel"), dir:vcardGet(e.vcardArray,"adr")}); if(depth<2) entitiesFlat(e.entities,out,depth+1); });
  return out;
}
async function rdap(path){
  const r = await fetch(`https://rdap.org/${path}`, {headers:{accept:"application/rdap+json"}, signal:AbortSignal.timeout(14000)});
  if(!r.ok) throw new Error(r.status===404 ? "El registro no tiene datos para esa consulta." : "El registro no respondió ("+r.status+").");
  const d = await r.json(); d._registro = (r.url.match(/rdap\.(\w+)\./)||[])[1]?.toUpperCase() || "—"; return d;
}
const evFecha = (d,k) => { const e=(d?.events||[]).find(x=>x.eventAction===k); return e? new Date(e.eventDate).toLocaleDateString("es-CL") : null; };
function entsHTML(ents){ return ents.length? ents.map(e=>`<div class="li" style="flex-direction:column;align-items:flex-start;gap:3px"><div><span class="badge ${/abuse/.test(e.roles)?'b-bad':/registrant/.test(e.roles)?'b-ok':'b-mut'}">${esc(e.roles||"entidad")}</span> <b>${esc(e.nombre||e.handle||"")}</b></div>${e.email?`<div class="mono">${esc(e.email)}</div>`:""}${e.tel?`<div class="mono">${esc(e.tel)}</div>`:""}${e.dir?`<div style="font-size:12px;color:var(--muted)">${esc(e.dir)}</div>`:""}</div>`).join("") : `<div class="status">Sin contactos publicados.</div>`; }
T.whois = {
  titulo:"WHOIS de IP",
  render(){ return `<div class="card"><h2>Dirección IP pública</h2><div class="inrow"><input id="q" placeholder="8.8.8.8 o 2001:4860:4860::8888" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">WHOIS</button></div>
    <div class="chips"><span class="chip" data-q="8.8.8.8">Google DNS</span><span class="chip" data-q="1.1.1.1">Cloudflare</span><span class="chip" data-q="208.67.222.222">OpenDNS</span><span class="chip" data-q="13.107.42.14">Microsoft</span>${S.ip4?`<span class="chip" data-q="${S.ip4}">Mi IP</span>`:""}</div>
    <p class="lead" style="margin:10px 0 0">Consulta RDAP (el WHOIS moderno) directamente al registro regional (ARIN, LACNIC, RIPE, APNIC o AFRINIC). Identifica al titular del bloque, no a la persona que usa la IP.</p></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    if(!isIP(q)) throw new Error("Ingresa una dirección IPv4 o IPv6 válida.");
    const d = await rdap("ip/"+q);
    const cidr = (d.cidr0_cidrs||[]).map(c=>`${c.v4prefix||c.v6prefix}/${c.length}`).join(", ");
    const pairs = [["Registro regional",d._registro],["Nombre del bloque",d.name],["Handle",d.handle],["Rango",`${d.startAddress} – ${d.endAddress}`],["CIDR",cidr||null],["Tipo",d.type],["País",d.country],["Versión",d.ipVersion],["Bloque padre",d.parentHandle],["Registrado",evFecha(d,"registration")],["Última modificación",evFecha(d,"last changed")],["ASN origen",(d.arin_originas0_originautnums||[]).map(a=>"AS"+a).join(", ")||null]];
    const ents = entitiesFlat(d.entities);
    const remarks = (d.remarks||[]).map(x=>(x.description||[]).join(" ")).join("\n");
    $("out").innerHTML = `<div class="card"><h2>Bloque de red <span class="sub">${esc(q)}</span></h2>${rowsHTML(pairs,"w")}${copyAllBtn(()=>pairsToText("WHOIS "+q, pairs)+"\n\nContactos:\n"+ents.map(e=>`  [${e.roles}] ${e.nombre||e.handle||""} ${e.email||""} ${e.tel||""}`).join("\n"))}</div>
      <div class="card"><h2>Contactos y entidades</h2>${entsHTML(ents)}</div>
      ${remarks?`<div class="card"><h2>Observaciones del registro</h2><div class="pre">${esc(remarks)}</div></div>`:""}`;
  }); }
};

/* ---- ASN ---- */
T.asn = {
  titulo:"Consultar ASN",
  render(){ return `<div class="card"><h2>Número de sistema autónomo</h2><div class="inrow"><input id="q" placeholder="22047 o AS15169" inputmode="numeric" autocapitalize="none"><button id="go">Consultar</button></div>
    <div class="chips"><span class="chip" data-q="15169">Google</span><span class="chip" data-q="13335">Cloudflare</span><span class="chip" data-q="32934">Meta</span><span class="chip" data-q="22047">VTR</span><span class="chip" data-q="27651">Entel</span><span class="chip" data-q="7418">Movistar CL</span>${S.info.v4?.asnNum?`<span class="chip" data-q="${S.info.v4.asnNum}">Mi ASN</span>`:""}</div></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    const n = q.replace(/^as/i,"").trim(); if(!/^\d+$/.test(n)) throw new Error("Ingresa un ASN numérico (p. ej. 22047).");
    const [rd, ov, px] = await Promise.all([
      rdap("autnum/"+n).catch(()=>null),
      getJSON(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${n}`).catch(()=>null),
      getJSON(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${n}`,15000).catch(()=>null),
    ]);
    if(!rd && !ov) throw new Error("No se encontró información para AS"+n);
    const ents = entitiesFlat(rd?.entities);
    const prefs = (px?.data?.prefixes||[]).map(p=>p.prefix);
    const v4 = prefs.filter(p=>!p.includes(":")), v6 = prefs.filter(p=>p.includes(":"));
    const pairs = [["ASN","AS"+n],["Titular",ov?.data?.holder||rd?.name||null],["Nombre RDAP",rd?.name],["Registro regional",rd?._registro],["Handle",rd?.handle],["País",rd?.country],["Anunciado en BGP",ov?.data?.announced==null?null:(ov.data.announced?"Sí":"No")],["Registrado",evFecha(rd,"registration")],["Última modificación",evFecha(rd,"last changed")],["Prefijos IPv4",String(v4.length)],["Prefijos IPv6",String(v6.length)]];
    $("out").innerHTML = `<div class="card"><h2>AS${esc(n)}</h2>${rowsHTML(pairs,"a")}${copyAllBtn(()=>pairsToText("AS"+n, pairs)+"\n\nPrefijos:\n"+prefs.join("\n"))}</div>
      ${ents.length?`<div class="card"><h2>Contactos</h2>${entsHTML(ents)}</div>`:""}
      <div class="card"><h2>Prefijos anunciados <span class="sub">${prefs.length}</span></h2>${prefs.length?`<div class="pre">${esc(prefs.slice(0,300).join("\n"))}${prefs.length>300?`\n… y ${prefs.length-300} más`:""}</div>`:`<div class="status">Sin prefijos visibles en RIPE RIS.</div>`}</div>`;
  }); }
};

/* ---- DNS ---- */
const DNS_TYPES = {A:1,AAAA:28,CNAME:5,MX:15,NS:2,TXT:16,SOA:6,CAA:257,SRV:33,PTR:12};
const RCODE = {0:"Sin registros de este tipo",1:"Error de formato",2:"Fallo del servidor",3:"El nombre no existe (NXDOMAIN)",5:"Consulta rechazada"};
async function doh(name, type){ return getJSON(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, 9000, {accept:"application/dns-json"}); }
const TYPE_INV = Object.fromEntries(Object.entries(DNS_TYPES).map(([k,v])=>[v,k]));
const dnsRows = ans => ans.map(a=>({tipo:TYPE_INV[a.type]||a.type, nombre:a.name, ttl:a.TTL, data:a.data.replace(/^"|"$/g,"").replace(/" "/g,"")}));
T.dns = {
  titulo:"Consulta DNS",
  render(){ return `<div class="card"><h2>Dominio y tipo de registro</h2><div class="inrow"><input id="q" placeholder="ejemplo.com" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><select id="type"><option>TODOS</option>${Object.keys(DNS_TYPES).filter(t=>t!=="PTR").map(t=>`<option>${t}</option>`).join("")}</select><button id="go">Buscar</button></div>
    <div class="chips"><span class="chip" data-q="google.com">google.com</span><span class="chip" data-q="cloudflare.com">cloudflare.com</span><span class="chip" data-q="gob.cl">gob.cl</span><span class="chip" data-q="github.com">github.com</span></div>
    <p class="lead" style="margin:10px 0 0">Resuelve mediante DNS sobre HTTPS (Cloudflare 1.1.1.1) e indica si la respuesta fue validada con DNSSEC.</p></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    const dom = q.replace(/^https?:\/\//,"").replace(/\/.*$/,"").toLowerCase();
    if(!isDomain(dom)) throw new Error("Ingresa un dominio válido (p. ej. ejemplo.com).");
    const sel = $("type").value;
    const types = sel==="TODOS" ? ["A","AAAA","CNAME","MX","NS","TXT","SOA","CAA"] : [sel];
    const res = await Promise.all(types.map(t=>doh(dom,t).then(d=>({t,d})).catch(e=>({t,err:e.message}))));
    let html = "", txt = `DNS ${dom}\n`;
    const ad = res.find(r=>r.d)?.d?.AD;
    res.forEach(({t,d,err})=>{
      const rows = d?.Answer ? dnsRows(d.Answer) : [];
      if (sel==="TODOS" && !rows.length && !err) return;
      txt += `\n[${t}] ${err? "error: "+err : rows.length? "" : (RCODE[d.Status]||"sin registros")}\n` + rows.map(r=>`  ${r.nombre}  ${r.ttl}s  ${r.tipo}  ${r.data}`).join("\n");
      html += `<div class="sect">${t}</div>` + (err? `<div class="status err">${esc(err)}</div>` : rows.length ? `<div class="list">${rows.map(r=>`<div class="li"><div><span class="badge b-mut">${esc(r.tipo)}</span> <span class="mono">${esc(r.data)}</span></div><div style="font-size:11px;color:var(--muted);white-space:nowrap">TTL ${r.ttl}s</div></div>`).join("")}</div>` : `<div class="status">${esc(RCODE[d.Status]||"Sin registros de este tipo")}</div>`);
    });
    if (!html) html = `<div class="status" style="padding:10px 0">${esc(RCODE[res[0]?.d?.Status]||"El dominio no tiene registros publicados.")}</div>`;
    $("out").innerHTML = `<div class="card"><h2>${esc(dom)} <span class="badge ${ad?'b-ok':'b-mut'}">${ad?"DNSSEC validado":"Sin DNSSEC"}</span></h2>${html}${copyAllBtn(()=>txt)}</div>`;
  }); }
};

/* ---- DNS inverso ---- */
function expandIPv6(ip){
  let [h,t] = ip.split("::"); let hp = h?h.split(":"):[], tp = t?t.split(":"):[];
  if (ip.includes("::")) hp = [...hp, ...Array(8-hp.length-tp.length).fill("0"), ...tp];
  return hp.map(p=>p.padStart(4,"0")).join(":");
}
function ptrName(ip){
  if (isIPv4(ip)) return ip.split(".").reverse().join(".")+".in-addr.arpa";
  return expandIPv6(ip).replace(/:/g,"").split("").reverse().join(".")+".ip6.arpa";
}
T.rdns = {
  titulo:"DNS inverso",
  render(){ return `<div class="card"><h2>Dirección IP</h2><div class="inrow"><input id="q" placeholder="8.8.8.8" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">Resolver</button></div>
    <div class="chips"><span class="chip" data-q="8.8.8.8">Google DNS</span><span class="chip" data-q="1.1.1.1">Cloudflare</span><span class="chip" data-q="9.9.9.9">Quad9</span>${S.ip4?`<span class="chip" data-q="${S.ip4}">Mi IP</span>`:""}</div>
    <p class="lead" style="margin:10px 0 0">Busca el registro PTR: el nombre de host que el dueño del bloque asoció a la IP. Muchas IP residenciales no tienen uno o muestran un nombre genérico del proveedor.</p></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    if(!isIP(q)) throw new Error("Ingresa una dirección IP válida.");
    const name = ptrName(q); const d = await doh(name,"PTR");
    const hosts = (d.Answer||[]).filter(a=>a.type===12).map(a=>a.data.replace(/\.$/,""));
    let fwd = "";
    if (hosts[0]){ try { const f = await doh(hosts[0], isIPv4(q)?"A":"AAAA"); const ips=(f.Answer||[]).map(a=>a.data); fwd = ips.includes(q) ? "Confirmado (el hostname resuelve de vuelta a esta IP)" : ips.length? "No coincide (resuelve a "+ips.join(", ")+")" : "El hostname no resuelve"; } catch { fwd="No verificable"; } }
    const pairs=[["IP",q],["Consulta PTR",name],["Hostname",hosts.join(", ")||"Sin registro PTR"],["Verificación directa",fwd||null],["TTL",d.Answer?.[0]?.TTL!=null? d.Answer[0].TTL+" s":null]];
    $("out").innerHTML = `<div class="card"><h2>Resultado</h2>${rowsHTML(pairs,"r")}${copyAllBtn(()=>pairsToText("DNS inverso "+q,pairs))}</div>`;
  }); }
};

/* ---- Correo del dominio ---- */
T.email = {
  titulo:"Correo del dominio",
  render(){ return `<div class="card"><h2>Dominio</h2><div class="inrow"><input id="q" placeholder="ejemplo.com" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">Analizar</button></div>
    <div class="inrow" style="margin-top:8px"><input id="dkim" placeholder="Selector DKIM (opcional: google, default, selector1…)" autocapitalize="none" autocorrect="off"></div>
    <div class="chips"><span class="chip" data-q="gmail.com">gmail.com</span><span class="chip" data-q="outlook.com">outlook.com</span><span class="chip" data-q="gob.cl">gob.cl</span></div>
    <p class="lead" style="margin:10px 0 0">Revisa la infraestructura de correo: servidores MX, política SPF, política DMARC y, si indicas un selector, la clave DKIM.</p></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    const dom = q.replace(/^.*@/,"").toLowerCase(); if(!isDomain(dom)) throw new Error("Ingresa un dominio válido.");
    const sel = $("dkim").value.trim();
    const [mx, txt, dmarc, dkim] = await Promise.all([doh(dom,"MX"), doh(dom,"TXT"), doh("_dmarc."+dom,"TXT"), sel? doh(`${sel}._domainkey.${dom}`,"TXT").catch(()=>null) : null]);
    const mxs = (mx.Answer||[]).filter(a=>a.type===15).map(a=>a.data).sort((a,b)=>parseInt(a)-parseInt(b));
    const clean = a => a.data.replace(/^"|"$/g,"").replace(/" "/g,"");
    const spf = (txt.Answer||[]).map(clean).find(t=>/^v=spf1/i.test(t));
    const dm = (dmarc.Answer||[]).map(clean).find(t=>/^v=DMARC1/i.test(t));
    const dk = dkim ? (dkim.Answer||[]).map(clean).find(t=>/v=DKIM1|p=/i.test(t)) : null;
    const spfEval = spf ? (/-all/.test(spf)?["b-ok","Estricto (-all)"]:/~all/.test(spf)?["b-warn","Suave (~all)"]:/\?all/.test(spf)?["b-warn","Neutral (?all)"]:/\+all/.test(spf)?["b-bad","Permisivo (+all)"]:["b-mut","Sin calificador all"]) : ["b-bad","Sin SPF"];
    const p = dm ? (dm.match(/p=(\w+)/i)||[])[1] : null;
    const dmEval = dm ? (p==="reject"?["b-ok","p=reject"]:p==="quarantine"?["b-warn","p=quarantine"]:["b-bad","p=none (solo monitoreo)"]) : ["b-bad","Sin DMARC"];
    const badge = ([c,l]) => `<span class="badge ${c}">${esc(l)}</span>`;
    const text = `Correo ${dom}\nMX:\n${mxs.map(m=>"  "+m).join("\n")||"  (ninguno)"}\nSPF: ${spf||"(ninguno)"}\nDMARC: ${dm||"(ninguno)"}${sel?`\nDKIM (${sel}): ${dk||"(no encontrado)"}`:""}`;
    $("out").innerHTML = `<div class="card"><h2>${esc(dom)}</h2>
      <div class="sect">Servidores MX ${mxs.length?`<span class="badge b-ok">${mxs.length}</span>`:`<span class="badge b-bad">Ninguno</span>`}</div>
      ${mxs.length?`<div class="list">${mxs.map(m=>{const [pr,h]=m.split(" ");return `<div class="li"><span class="mono">${esc(h.replace(/\.$/,""))}</span><span class="badge b-mut">prioridad ${esc(pr)}</span></div>`;}).join("")}</div>`:`<div class="status">El dominio no recibe correo (sin MX).</div>`}
      <div class="sect">SPF ${badge(spfEval)}</div>${spf?`<div class="pre">${esc(spf)}</div>`:`<div class="status">No hay registro SPF: cualquier servidor podría enviar en nombre del dominio.</div>`}
      <div class="sect">DMARC ${badge(dmEval)}</div>${dm?`<div class="pre">${esc(dm)}</div>`:`<div class="status">No hay política DMARC publicada en _dmarc.${esc(dom)}.</div>`}
      ${sel?`<div class="sect">DKIM (${esc(sel)}) ${dk?'<span class="badge b-ok">Publicado</span>':'<span class="badge b-bad">No encontrado</span>'}</div>${dk?`<div class="pre">${esc(dk)}</div>`:""}`:""}
      ${copyAllBtn(()=>text)}</div>`;
  }); }
};

/* ---- Listas negras ---- */
const DNSBLS = [["bl.spamcop.net","SpamCop"],["b.barracudacentral.org","Barracuda"],["dnsbl-1.uceprotect.net","UCEPROTECT L1"],["psbl.surriel.com","PSBL"],["all.s5h.net","S5H"],["dnsbl.dronebl.org","DroneBL"],["zen.spamhaus.org","Spamhaus ZEN"],["bl.mailspike.net","Mailspike"],["ix.dnsbl.manitu.net","Manitu (NiX)"],["dnsbl.spfbl.net","SPFBL"],["spam.spamrats.com","SpamRats"],["truncate.gbudb.net","GBUdb Truncate"]];
T.dnsbl = {
  titulo:"Listas negras",
  render(){ return `<div class="card"><h2>Dirección IPv4</h2><div class="inrow"><input id="q" placeholder="190.162.151.147" inputmode="decimal" autocapitalize="none"><button id="go">Verificar</button></div>
    <div class="chips">${S.ip4?`<span class="chip" data-q="${S.ip4}">Mi IP</span>`:""}<span class="chip" data-q="127.0.0.2">IP de prueba (listada)</span></div>
    <p class="lead" style="margin:10px 0 0">Consulta ${DNSBLS.length} listas DNSBL públicas. Aparecer en una lista suele afectar la entrega de correo saliente desde esa IP.</p></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    if(!isIPv4(q)) throw new Error("Solo se admiten direcciones IPv4.");
    const rev = q.split(".").reverse().join(".");
    $("out").innerHTML = `<div class="card"><h2>Resultado <span class="sub" id="bl-sum">0/${DNSBLS.length}</span></h2><div class="list" id="bl-list">${DNSBLS.map(([z,n])=>`<div class="li" id="bl-${z.replace(/\W/g,'_')}"><span>${esc(n)}</span><span class="badge b-mut">…</span></div>`).join("")}</div><div class="status" style="margin-top:8px" id="bl-note"></div></div>`;
    let listed=0, done=0;
    await Promise.all(DNSBLS.map(async ([z])=>{
      const el = $("bl-"+z.replace(/\W/g,'_')).querySelector(".badge");
      try {
        const d = await doh(`${rev}.${z}`,"A");
        const a = (d.Answer||[]).filter(x=>x.type===1).map(x=>x.data);
        if (a.some(ip=>ip.startsWith("127.255."))) { el.className="badge b-mut"; el.textContent="No consultable vía DNS público"; }
        else if (a.length){ listed++; el.className="badge b-bad"; el.textContent="LISTADA ("+a[0]+")"; }
        else if (d.Status===3 || d.Status===0){ el.className="badge b-ok"; el.textContent="Limpia"; }
        else { el.className="badge b-mut"; el.textContent="Sin respuesta"; }
      } catch { el.className="badge b-mut"; el.textContent="Error"; }
      done++; $("bl-sum").textContent = `${listed} listada${listed===1?"":"s"} de ${done}`;
    }));
    $("bl-note").textContent = listed ? "La IP aparece en al menos una lista. Si es tuya y envías correo, solicita la baja en el sitio de cada lista." : "La IP no aparece en las listas consultables.";
  }); }
};

/* ---- Analizar IP ---- */
function ip4ToInt(ip){ return ip.split(".").reduce((a,o)=>(a<<8)+(+o),0)>>>0; }
function intToIp4(n){ return [n>>>24, (n>>16)&255, (n>>8)&255, n&255].join("."); }
function inCidr(ip, cidr){ const [b,l]=cidr.split("/"); const m = +l===0?0:(~0<<(32-l))>>>0; return (ip4ToInt(ip)&m)>>>0===(ip4ToInt(b)&m)>>>0; }
const SPECIAL4 = [["0.0.0.0/8","Esta red (no enrutable)"],["10.0.0.0/8","Privada (RFC 1918)"],["100.64.0.0/10","CGNAT / espacio compartido (RFC 6598)"],["127.0.0.0/8","Loopback (localhost)"],["169.254.0.0/16","Enlace local (APIPA)"],["172.16.0.0/12","Privada (RFC 1918)"],["192.0.0.0/24","Asignaciones especiales IETF"],["192.0.2.0/24","Documentación (TEST-NET-1)"],["192.88.99.0/24","6to4 relay (obsoleto)"],["192.168.0.0/16","Privada (RFC 1918)"],["198.18.0.0/15","Pruebas de rendimiento"],["198.51.100.0/24","Documentación (TEST-NET-2)"],["203.0.113.0/24","Documentación (TEST-NET-3)"],["224.0.0.0/4","Multicast"],["255.255.255.255/32","Broadcast limitado"],["240.0.0.0/4","Reservada (uso futuro)"]];
function classify4(ip){ const s = SPECIAL4.find(([c])=>inCidr(ip,c)); if (s) return {tipo:s[1], publica:false, rango:s[0]}; return {tipo:"Pública (enrutable en Internet)", publica:true, rango:"—"}; }
function classify6(ip){
  const f = expandIPv6(ip).toLowerCase();
  if (f==="0000:0000:0000:0000:0000:0000:0000:0001") return {tipo:"Loopback (::1)",publica:false};
  if (f==="0000:0000:0000:0000:0000:0000:0000:0000") return {tipo:"No especificada (::)",publica:false};
  if (/^fe[89ab]/.test(f)) return {tipo:"Enlace local (fe80::/10)",publica:false};
  if (/^f[cd]/.test(f)) return {tipo:"Local única / privada (fc00::/7)",publica:false};
  if (f.startsWith("ff")) return {tipo:"Multicast (ff00::/8)",publica:false};
  if (f.startsWith("2001:0db8")) return {tipo:"Documentación (2001:db8::/32)",publica:false};
  if (f.startsWith("0000:0000:0000:0000:0000:ffff")) return {tipo:"IPv4 mapeada (::ffff:0:0/96)",publica:false};
  if (f.startsWith("2002")) return {tipo:"6to4 (2002::/16)",publica:true};
  if (/^[23]/.test(f)) return {tipo:"Global unicast (pública)",publica:true};
  return {tipo:"Reservada / otra",publica:false};
}
T.verificar = {
  titulo:"Analizar IP",
  render(){ return `<div class="card"><h2>Dirección IP</h2><div class="inrow"><input id="q" placeholder="192.168.1.1 o fe80::1" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">Analizar</button></div>
    <div class="chips"><span class="chip" data-q="192.168.1.1">192.168.1.1</span><span class="chip" data-q="10.0.0.1">10.0.0.1</span><span class="chip" data-q="100.64.0.1">100.64.0.1</span><span class="chip" data-q="8.8.8.8">8.8.8.8</span><span class="chip" data-q="fe80::1">fe80::1</span><span class="chip" data-q="2606:4700::1111">2606:4700::1111</span></div></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    if(isIPv4(q)){
      const c = classify4(q), n = ip4ToInt(q), first=+q.split(".")[0];
      const clase = first<128?"A":first<192?"B":first<224?"C":first<240?"D (multicast)":"E (reservada)";
      const pairs=[["Versión","IPv4"],["Tipo",c.tipo],["Rango especial",c.rango],["Enrutable en Internet",c.publica?"Sí":"No"],["Clase histórica",clase],["Decimal",String(n)],["Hexadecimal","0x"+n.toString(16).toUpperCase().padStart(8,"0")],["Binario",q.split(".").map(o=>(+o).toString(2).padStart(8,"0")).join(".")],["Octal",q.split(".").map(o=>(+o).toString(8)).join(".")],["Registro PTR",ptrName(q)],["IPv6 mapeada","::ffff:"+q],["6to4 (2002::/16)", c.publica? "2002:"+(n>>>16).toString(16).padStart(4,"0")+":"+(n&65535).toString(16).padStart(4,"0")+"::" : null]];
      $("out").innerHTML = `<div class="card"><h2>${esc(q)} <span class="badge ${c.publica?'b-ok':'b-warn'}">${c.publica?"Pública":"No pública"}</span></h2>${rowsHTML(pairs,"v")}${copyAllBtn(()=>pairsToText("IP "+q,pairs))}</div>${c.publica?`<div class="card"><h2>Más</h2><div class="chips"><span class="chip" data-go="lookup" data-arg="${esc(q)}">Geolocalizar</span><span class="chip" data-go="whois" data-arg="${esc(q)}">WHOIS</span><span class="chip" data-go="rdns" data-arg="${esc(q)}">DNS inverso</span><span class="chip" data-go="dnsbl" data-arg="${esc(q)}">Listas negras</span></div></div>`:""}`;
    } else if (isIPv6(q)){
      const c = classify6(q), full = expandIPv6(q);
      let comp = full.split(":").map(h=>h.replace(/^0+(?=.)/,"")).join(":");
      const runs = comp.match(/(^|:)(0(:0)+)(:|$)/g); if (runs){ const longest = runs.sort((a,b)=>b.length-a.length)[0]; comp = comp.replace(longest, "::").replace(/:{3,}/,"::"); }
      const pairs=[["Versión","IPv6"],["Tipo",c.tipo],["Enrutable en Internet",c.publica?"Sí":"No"],["Forma expandida",full],["Forma comprimida",comp],["Prefijo /64",full.split(":").slice(0,4).join(":")+"::/64"],["Prefijo /48",full.split(":").slice(0,3).join(":")+"::/48"],["Identificador de interfaz",full.split(":").slice(4).join(":")],["Registro PTR",ptrName(q)],["Binario (primeros 64 bits)",full.split(":").slice(0,4).map(h=>parseInt(h,16).toString(2).padStart(16,"0")).join(" ")]];
      $("out").innerHTML = `<div class="card"><h2>${esc(q)} <span class="badge ${c.publica?'b-ok':'b-warn'}">${c.publica?"Pública":"No pública"}</span></h2>${rowsHTML(pairs,"v")}${copyAllBtn(()=>pairsToText("IP "+q,pairs))}</div>${c.publica?`<div class="card"><h2>Más</h2><div class="chips"><span class="chip" data-go="lookup" data-arg="${esc(q)}">Geolocalizar</span><span class="chip" data-go="whois" data-arg="${esc(q)}">WHOIS</span><span class="chip" data-go="rdns" data-arg="${esc(q)}">DNS inverso</span></div></div>`:""}`;
    } else throw new Error("No es una dirección IPv4 ni IPv6 válida.");
  }); }
};

/* ---- Calculadora de subred ---- */
T.subred = {
  titulo:"Calculadora de subred",
  render(){ return `<div class="card"><h2>Red en notación CIDR</h2><div class="inrow"><input id="q" placeholder="192.168.1.0/24" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">Calcular</button></div>
    <div class="chips"><span class="chip" data-q="192.168.1.0/24">/24</span><span class="chip" data-q="10.0.0.0/8">/8</span><span class="chip" data-q="172.16.0.0/12">/12</span><span class="chip" data-q="192.168.0.0/22">/22</span><span class="chip" data-q="203.0.113.5/30">/30</span></div>
    <p class="lead" style="margin:10px 0 0">También acepta IP + máscara, p. ej. <b>192.168.1.10 255.255.255.0</b>.</p></div><div id="out"></div>`; },
  init(){ wireQuery(async q=>{
    const m = q.match(/^(\S+)\s*[\/ ]\s*(\S+)$/); if(!m) throw new Error("Formato: IP/prefijo o IP máscara.");
    const ip = m[1]; if(!isIPv4(ip)) throw new Error("IP inválida."); let len;
    if (isIPv4(m[2])){ const mi=ip4ToInt(m[2]); len = 32-Math.log2((~mi>>>0)+1); if(!Number.isInteger(len)) throw new Error("Máscara no contigua."); } else { len=+m[2]; if(!(len>=0 && len<=32)) throw new Error("Prefijo entre 0 y 32."); }
    const mask = len===0?0:(~0<<(32-len))>>>0, n = ip4ToInt(ip), net = (n&mask)>>>0, bc = (net|(~mask>>>0))>>>0, total = 2**(32-len);
    const hosts = len>=31 ? total : total-2, first = len>=31 ? net : net+1, last = len>=31 ? bc : bc-1;
    const pairs=[["Red",`${intToIp4(net)}/${len}`],["Máscara",intToIp4(mask)],["Wildcard",intToIp4((~mask)>>>0)],["Broadcast",len===32?"—":intToIp4(bc)],["Primer host",intToIp4(first)],["Último host",intToIp4(last)],["Hosts utilizables",hosts.toLocaleString("es-CL")],["Direcciones totales",total.toLocaleString("es-CL")],["Tipo",classify4(intToIp4(net)).tipo],["Máscara binaria",intToIp4(mask).split(".").map(o=>(+o).toString(2).padStart(8,"0")).join(".")],["IP ingresada",ip+(n===net&&len<31?" (es la dirección de red)":n===bc&&len<31?" (es el broadcast)":"")]];
    if (len<30) pairs.push(["Si se divide",[len+1,len+2].map(l=>`${2**(l-len)} subredes /${l} de ${(2**(32-l)-2).toLocaleString("es-CL")} hosts`).join(" · ")]);
    $("out").innerHTML = `<div class="card"><h2>${esc(intToIp4(net))}/${len}</h2>${rowsHTML(pairs,"s")}${copyAllBtn(()=>pairsToText("Subred "+intToIp4(net)+"/"+len,pairs))}</div>`;
  }); }
};

/* ---- IP aleatoria ---- */
T.random = {
  titulo:"IP aleatoria",
  render(){ return `<div class="card"><h2>Generador</h2><div class="inrow"><select id="ver" style="flex:1"><option value="4">IPv4</option><option value="6">IPv6</option></select><select id="cnt" style="flex:1">${[1,5,10,15].map(n=>`<option ${n===5?'selected':''}>${n}</option>`).join("")}</select><button id="gen">Generar</button></div>
    <label class="chk"><input type="checkbox" id="pub" checked> Solo direcciones públicas (excluye privadas, reservadas y multicast)</label></div><div id="out"></div>`; },
  init(){
    const gen = () => {
      const v = $("ver").value, n = +$("cnt").value, pub = $("pub").checked, out = [];
      while (out.length<n){
        let ip;
        if (v==="4"){ ip = Array.from(crypto.getRandomValues(new Uint8Array(4))).join("."); if (pub && !classify4(ip).publica) continue; }
        else { const b = crypto.getRandomValues(new Uint16Array(8)); if (pub) b[0] = 0x2000 | (b[0] & 0x1fff); ip = Array.from(b).map(x=>x.toString(16)).join(":"); if (pub && !classify6(ip).publica) continue; }
        out.push(ip);
      }
      $("out").innerHTML = `<div class="card"><h2>Resultado</h2><div class="list">${out.map((ip,i)=>`<div class="li"><span class="mono" id="rnd-${i}">${ip}</span><button class="copy" data-copy="rnd-${i}">Copiar</button></div>`).join("")}</div>${copyAllBtn(()=>out.join("\n"))}</div>`;
    };
    $("gen").onclick = gen; gen();
  }
};

/* ---- IP del router ---- */
const ROUTERS = [["TP-Link","192.168.0.1 · 192.168.1.1 · tplinkwifi.net"],["Huawei","192.168.1.1 · 192.168.3.1 · 192.168.100.1"],["ZTE","192.168.1.1 · 192.168.0.1"],["Xiaomi","192.168.31.1 · miwifi.com"],["Netgear","192.168.1.1 · 192.168.0.1 · routerlogin.net"],["Linksys","192.168.1.1 · myrouter.local"],["D-Link","192.168.0.1 · dlinkrouter.local"],["ASUS","192.168.1.1 · 192.168.50.1 · router.asus.com"],["Mikrotik","192.168.88.1"],["Ubiquiti","192.168.1.1 · 192.168.1.20"],["Apple (AirPort)","10.0.1.1"],["Google / Nest Wifi","192.168.86.1"],["Cisco","192.168.1.1 · 10.10.10.1"],["Sagemcom / Technicolor / Arris (cable)","192.168.0.1 · 192.168.1.1 · 192.168.100.1"],["VTR (Chile)","192.168.0.1 · 192.168.1.1"],["Movistar (Chile)","192.168.1.1"],["Entel (Chile)","192.168.1.1 · 192.168.0.1"],["Claro (Chile)","192.168.1.1 · 192.168.0.1"],["Mundo / GTD (Chile)","192.168.1.1 · 192.168.100.1"]];
T.router = {
  titulo:"IP del router",
  render(){ return `<div class="card"><h2>Cómo ver tu puerta de enlace</h2><p class="lead">La IP del router es la <b>puerta de enlace (gateway)</b> de tu red local. El navegador no puede leerla directamente, pero tu dispositivo sí:</p>
      <div class="rows">${[["iPhone / iPad","Configuración → Wi-Fi → ⓘ junto a tu red → Router"],["Mac","Configuración del Sistema → Wi-Fi → Detalles → TCP/IP → Router"],["Windows","cmd → ipconfig → «Puerta de enlace predeterminada»"],["Android","Configuración → Wi-Fi → tu red → Avanzado → Puerta de enlace"],["Linux","ip route | grep default"]].map(([k,v])=>`<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}</div></div>
    <div class="card"><h2>Probar direcciones habituales</h2><div class="chips">${["192.168.1.1","192.168.0.1","10.0.0.1","192.168.100.1","192.168.88.1","192.168.86.1","192.168.31.1","10.0.1.1"].map(ip=>`<a class="chip" href="http://${ip}" target="_blank" rel="noopener" style="text-decoration:none">${ip}</a>`).join("")}</div><div class="status" style="margin-top:8px">Se abren en una pestaña nueva; la que cargue la página de acceso es tu router.</div></div>
    <div class="card"><h2>Direcciones por fabricante / proveedor</h2><div class="rows">${ROUTERS.map(([k,v])=>`<div class="row"><div class="k">${k}</div><div class="v mono">${v}</div></div>`).join("")}</div></div>`; },
  init(){}
};

/* ---- Mi conexión ---- */
T.conexion = {
  titulo:"Mi conexión",
  render(){ return `<div class="card"><h2>Conexión con Internet <span class="sub" id="cx-st">consultando…</span></h2><div id="cx"></div></div>
    <div class="card"><h2>Navegador y dispositivo</h2><div id="nav"></div></div>
    <div class="card"><h2>Ping HTTP</h2><p class="lead">Mide el tiempo de respuesta de un servidor web (5 solicitudes). Útil para comparar sitios o detectar lentitud.</p><div class="inrow"><input id="q" placeholder="google.com" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="go">Ping</button></div>
      <div class="chips"><span class="chip" data-q="google.com">google.com</span><span class="chip" data-q="cloudflare.com">cloudflare.com</span><span class="chip" data-q="apple.com">apple.com</span><span class="chip" data-q="gob.cl">gob.cl</span></div><div id="out"></div></div>`; },
  async init(){
    const c = navigator.connection||{};
    const navPairs = [["Sistema / plataforma",navigator.platform||"—"],["Agente de usuario",navigator.userAgent],["Idioma",navigator.languages?.join(", ")||navigator.language],["Zona horaria del dispositivo",Intl.DateTimeFormat().resolvedOptions().timeZone],["Hora local",new Date().toLocaleString("es-CL")],["Pantalla",`${screen.width}×${screen.height} @${devicePixelRatio}x`],["Ventana",`${innerWidth}×${innerHeight}`],["Núcleos de CPU",navigator.hardwareConcurrency||"—"],["Memoria (aprox.)",navigator.deviceMemory? navigator.deviceMemory+" GB":"—"],["Tipo de red",c.effectiveType? `${c.effectiveType}${c.type?" ("+c.type+")":""}`:"—"],["Ancho de banda estimado",c.downlink? c.downlink+" Mb/s":"—"],["RTT estimado",c.rtt!=null? c.rtt+" ms":"—"],["Ahorro de datos",c.saveData?"Activado":"No"],["Estado","onLine" in navigator ? (navigator.onLine?"En línea":"Sin conexión") : "—"],["Cookies",navigator.cookieEnabled?"Habilitadas":"Bloqueadas"],["Pantalla táctil",navigator.maxTouchPoints>0?"Sí":"No"],["Modo instalado (PWA)",matchMedia("(display-mode: standalone)").matches?"Sí":"No"]];
    $("nav").innerHTML = rowsHTML(navPairs,"n") + copyAllBtn(()=>pairsToText("Navegador y dispositivo",navPairs));
    wireQuery(async q=>{
      const host = q.replace(/^https?:\/\//,"").replace(/\/.*$/,""); if(!isDomain(host) && !isIP(host)) throw new Error("Ingresa un dominio o IP.");
      const times=[]; const render = () => { $("out").innerHTML = `<div class="sect">https://${esc(host)}</div><div class="bars">${times.map(t=>`<i style="height:${Math.max(4,100*t/Math.max(...times))}%" title="${t.toFixed(0)} ms"></i>`).join("")}</div><div class="kv" style="margin-top:8px"><div class="box"><div class="l">Mínimo</div><div class="v">${fmt1(Math.min(...times))} ms</div></div><div class="box"><div class="l">Media</div><div class="v">${fmt1(avg(times))} ms</div></div><div class="box"><div class="l">Máximo</div><div class="v">${fmt1(Math.max(...times))} ms</div></div><div class="box"><div class="l">Jitter</div><div class="v">${times.length>1?fmt1(avg(times.slice(1).map((v,k)=>Math.abs(v-times[k])))):0} ms</div></div></div><div class="status" style="margin-top:6px">Tiempo hasta recibir respuesta HTTPS (la primera incluye DNS y TLS).</div>`; };
      for (let i=0;i<5;i++){ const t0=performance.now(); try { await fetch(`https://${host}/?ping=${Math.random()}`,{mode:"no-cors",cache:"no-store",signal:AbortSignal.timeout(8000)}); } catch(e){ if(i===0) throw new Error("El servidor no respondió."); } times.push(performance.now()-t0); render(); }
    });
    try {
      const t = await (await fetch("https://speed.cloudflare.com/cdn-cgi/trace",{cache:"no-store",signal:AbortSignal.timeout(8000)})).text();
      const kv = Object.fromEntries(t.trim().split("\n").map(l=>l.split("=")));
      const pairs = [["IP vista por el servidor",kv.ip],["Versión de IP",kv.ip?.includes(":")?"IPv6":"IPv4"],["Protocolo HTTP",kv.http?.toUpperCase()],["Versión TLS",kv.tls],["Intercambio de claves",kv.kex],["SNI",kv.sni==="plaintext"?"Visible (sin ECH)":kv.sni],["Nodo Cloudflare más cercano",kv.colo],["País detectado",kv.loc],["Cloudflare WARP",kv.warp==="on"?"Activo":"No"],["Hora del servidor",kv.ts? new Date(+kv.ts*1000).toLocaleTimeString("es-CL"):null]];
      if ($("cx")){ $("cx").innerHTML = rowsHTML(pairs,"c") + copyAllBtn(()=>pairsToText("Conexión",pairs)); $("cx-st").textContent = ""; }
    } catch { if ($("cx")){ $("cx").innerHTML = `<div class="status err">No se pudo consultar (sin conexión o bloqueado).</div>`; $("cx-st").textContent=""; } }
  }
};

/* ---- Prueba de velocidad ---- */
const CF = "https://speed.cloudflare.com";
const SP = { running:false, down:[], up:[], lat:[], xhrs:[] };
T.velocidad = {
  titulo:"Prueba de velocidad",
  render(){ return `<div class="card"><h2>Velocidad <span class="sub" id="st-server"></span></h2>
    <div class="gauge-wrap"><svg class="gauge" viewBox="0 0 200 120"><path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="14" stroke-linecap="round"/><path id="g-arc" d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" stroke-dasharray="251.3" stroke-dashoffset="251.3"/><text x="100" y="88" text-anchor="middle" id="g-val" fill="#eef2ff" font-size="30" font-weight="800">—</text><text x="100" y="108" text-anchor="middle" id="g-lbl" fill="#93a0c8" font-size="11" font-weight="700">Mb/s</text></svg></div>
    <div class="metrics">
      <div class="metric"><div class="mh">▼ Descarga</div><canvas id="c-down" width="200" height="50"></canvas><div class="mv"><span>Máximo</span><b id="d-max">—</b></div><div class="mv"><span>Media</span><b id="d-avg">—</b></div></div>
      <div class="metric"><div class="mh">▲ Carga</div><canvas id="c-up" width="200" height="50"></canvas><div class="mv"><span>Máximo</span><b id="u-max">—</b></div><div class="mv"><span>Media</span><b id="u-avg">—</b></div></div>
      <div class="metric"><div class="mh">◆ Latencia</div><canvas id="c-lat" width="200" height="50"></canvas><div class="mv"><span>Mínima</span><b id="l-min">—</b></div><div class="mv"><span>Media</span><b id="l-avg">—</b></div><div class="mv"><span>Jitter</span><b id="l-jit">—</b></div></div>
    </div>
    <button class="allbtn" id="speedbtn" style="margin-top:12px">Iniciar prueba</button>
    <div class="status" id="speedstatus" style="margin-top:8px">Servidor: Cloudflare (speed.cloudflare.com), el nodo más cercano a tu red. Consume ~150 MB de datos.</div>
    <div id="speedsum"></div></div>`; },
  init(){ $("speedbtn").onclick = runSpeed; if (SP.running){ $("speedbtn").textContent="Probando…"; $("speedbtn").disabled=true; } else if (SP.down.length) paintSpeedSummary(); }
};
function gauge(val, label, max){ const arc=$("g-arc"); if(!arc) return; const frac = val==null?0:Math.min(1, Math.log10(1+val)/Math.log10(1+max)); arc.style.strokeDashoffset=(251.3*(1-frac)).toFixed(1); $("g-val").textContent = val==null?"—":fmt1(val); $("g-lbl").textContent=label; }
function drawBars(id, data, color){ const c=$(id); if(!c) return; const ctx=c.getContext("2d"), W=c.width, H=c.height; ctx.clearRect(0,0,W,H); if(!data.length) return; const max=Math.max(...data,1e-9), n=Math.max(data.length,30), bw=W/n; ctx.fillStyle=color; data.forEach((v,i)=>{ const h=Math.max(2,(v/max)*(H-4)); ctx.fillRect(i*bw,H-h,Math.max(1,bw-1),h); }); }
const setT = (id,t) => { const e=$(id); if(e) e.textContent=t; };
async function testLatency(n=12){
  SP.lat=[];
  for (let i=0;i<n;i++){
    const t0=performance.now();
    try { await fetch(`${CF}/__down?bytes=0&r=${Math.random()}`,{cache:"no-store"}); } catch { continue; }
    const ms=performance.now()-t0; if(i===0) continue;
    SP.lat.push(ms); drawBars("c-lat",SP.lat,"#ffd43b"); gauge(ms,"ms",300);
    setT("l-min",fmt1(Math.min(...SP.lat))+" ms"); setT("l-avg",fmt1(avg(SP.lat))+" ms");
    setT("l-jit",fmt1(SP.lat.length>1?avg(SP.lat.slice(1).map((v,k)=>Math.abs(v-SP.lat[k]))):0)+" ms");
  }
}
async function testDownload(seconds=10){
  SP.down=[]; const t0=performance.now(); let total=0,lastT=t0,lastB=0;
  const tick=()=>{ const now=performance.now(); if(now-lastT>=250){ const mbps=((total-lastB)*8)/((now-lastT)/1000)/1e6; SP.down.push(mbps); lastT=now; lastB=total; drawBars("c-down",SP.down,"#74c0fc"); gauge(mbps,"Mb/s ▼",1000); setT("d-max",fmt1(Math.max(...SP.down))+" Mb/s"); setT("d-avg",fmt1(avg(SP.down))+" Mb/s"); } };
  const worker=async()=>{ while(performance.now()-t0<seconds*1000 && SP.running){ const r=await fetch(`${CF}/__down?bytes=26214400&r=${Math.random()}`,{cache:"no-store"}); const reader=r.body.getReader(); while(true){ const {done,value}=await reader.read(); if(done) break; total+=value.length; tick(); if(performance.now()-t0>=seconds*1000||!SP.running){ reader.cancel(); break; } } } };
  await Promise.all([worker(),worker(),worker(),worker()]); tick();
}
function xhrUpload(blob,onProgress){ return new Promise(res=>{ const x=new XMLHttpRequest(); x.open("POST",`${CF}/__up?r=${Math.random()}`); x.upload.onprogress=e=>onProgress(e.loaded); x.onload=x.onerror=x.onabort=()=>res(); x.send(blob); SP.xhrs.push(x); }); }
async function testUpload(seconds=8){
  SP.up=[]; SP.xhrs=[]; const t0=performance.now(); let lastT=t0,lastB=0; const loaded={}; let id=0;
  const totalLoaded=()=>Object.values(loaded).reduce((a,b)=>a+b,0);
  const tick=()=>{ const now=performance.now(); if(now-lastT>=250){ const tot=totalLoaded(); const mbps=((tot-lastB)*8)/((now-lastT)/1000)/1e6; SP.up.push(mbps); lastT=now; lastB=tot; drawBars("c-up",SP.up,"#b197fc"); gauge(mbps,"Mb/s ▲",1000); setT("u-max",fmt1(Math.max(...SP.up))+" Mb/s"); setT("u-avg",fmt1(avg(SP.up))+" Mb/s"); } };
  const blob=new Blob([new Uint8Array(4*1024*1024)]);
  const worker=async()=>{ while(performance.now()-t0<seconds*1000 && SP.running){ const my=id++; await xhrUpload(blob,l=>{ loaded[my]=l; tick(); }); } };
  await Promise.all([worker(),worker(),worker()]); SP.xhrs.forEach(x=>{try{x.abort();}catch{}}); tick();
}
function speedText(){ return `Prueba de velocidad (${hora()})\n  Descarga: máx ${fmt1(Math.max(...SP.down))} · media ${fmt1(avg(SP.down))} Mb/s\n  Carga: máx ${fmt1(Math.max(...SP.up))} · media ${fmt1(avg(SP.up))} Mb/s\n  Latencia: mín ${fmt1(Math.min(...SP.lat))} · media ${fmt1(avg(SP.lat))} ms`; }
function paintSpeedSummary(){
  if(!SP.down.length || !$("speedsum")) return;
  drawBars("c-down",SP.down,"#74c0fc"); drawBars("c-up",SP.up,"#b197fc"); drawBars("c-lat",SP.lat,"#ffd43b");
  setT("d-max",fmt1(Math.max(...SP.down))+" Mb/s"); setT("d-avg",fmt1(avg(SP.down))+" Mb/s"); setT("u-max",fmt1(Math.max(...SP.up))+" Mb/s"); setT("u-avg",fmt1(avg(SP.up))+" Mb/s"); setT("l-min",fmt1(Math.min(...SP.lat))+" ms"); setT("l-avg",fmt1(avg(SP.lat))+" ms"); setT("l-jit",fmt1(SP.lat.length>1?avg(SP.lat.slice(1).map((v,k)=>Math.abs(v-SP.lat[k]))):0)+" ms");
  gauge(avg(SP.down),"Mb/s ▼ media",1000);
  const d=avg(SP.down), calif = d>=100?["b-ok","Excelente: 4K en varios dispositivos, videollamadas y juegos sin problemas"]:d>=25?["b-ok","Buena: streaming 4K y teletrabajo fluidos"]:d>=10?["b-warn","Aceptable: HD y videollamadas; 4K puede sufrir"]:["b-bad","Lenta: navegación básica, video con cortes"];
  $("speedsum").innerHTML = `<div class="sect">Evaluación</div><div class="li" style="flex-direction:column;align-items:flex-start"><span class="badge ${calif[0]}">${fmt1(d)} Mb/s de descarga media</span><span style="font-size:12.5px;color:var(--muted);margin-top:4px">${calif[1]}</span></div>${copyAllBtn(speedText,"Copiar resultado")}`;
  $("speedbtn").textContent="Repetir prueba";
}
async function runSpeed(){
  if (SP.running) return; SP.running=true;
  const btn=$("speedbtn"), st=$("speedstatus"); btn.textContent="Probando…"; btn.disabled=true; $("speedsum").innerHTML="";
  ["d-max","d-avg","u-max","u-avg","l-min","l-avg","l-jit"].forEach(i=>setT(i,"—")); ["c-down","c-up","c-lat"].forEach(i=>drawBars(i,[],"#000"));
  try {
    try { const tr=await (await fetch(`${CF}/cdn-cgi/trace`,{cache:"no-store"})).text(); const colo=(tr.match(/colo=(\w+)/)||[])[1]; if(colo) setT("st-server",`nodo ${colo}`); } catch {}
    setT("speedstatus","Midiendo latencia…"); await testLatency();
    setT("speedstatus","Midiendo descarga…"); await testDownload();
    setT("speedstatus","Midiendo carga…"); await testUpload();
    setT("speedstatus","Prueba completa · "+hora()); paintSpeedSummary();
  } catch(e){ if($("speedstatus")){ $("speedstatus").className="status err"; $("speedstatus").textContent="La prueba falló: "+e.message; } }
  SP.running=false; if($("speedbtn")){ $("speedbtn").disabled=false; if(!SP.down.length) $("speedbtn").textContent="Iniciar prueba"; }
}

/* ===================== router ===================== */
function go(id, arg){ if (arg) S.arg = arg; const h = id==="home" ? "" : "#"+id; if (location.hash===h || (h==="" && !location.hash)) route(); else location.hash = h; }
async function route(){
  const id = location.hash.replace("#","") || "home";
  const tool = T[id] || T.home;
  if (S.map){ S.map.remove(); S.map=null; S.marker=null; S.circle=null; }
  $("title").textContent = tool.titulo; $("back").classList.toggle("hidden", id==="home");
  $("refresh").classList.toggle("hidden", !(id==="home"||id==="miip"||id==="conexion"));
  $("view").innerHTML = tool.render();
  window.scrollTo(0,0);
  S.current = id;
  await tool.init(false);
}
document.addEventListener("click", e=>{
  const c = e.target.closest("[data-copy]"); if (c){ const el=$(c.dataset.copy); if(el && !el.classList.contains("none")) copyText(el.textContent.trim(), c); return; }
  const g = e.target.closest("[data-go]"); if (g){ go(g.dataset.go, g.dataset.arg); }
});
$("back").onclick = () => go("home");
$("refresh").onclick = async () => { if (S.current==="miip") T.miip.init(true); else if (S.current==="home"){ $("h-ip").innerHTML='<div class="skeleton"></div>'; await loadMyIP(); route(); } else route(); };
window.addEventListener("hashchange", route);
route();
