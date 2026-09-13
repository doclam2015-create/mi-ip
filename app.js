const S = { ip4:null, ip6:null, info:{v4:null, v6:null}, tab:"v4", map:null, marker:null };

const FIELDS = [
  ["ip","Dirección IP"],["city","Ciudad"],["region","Estado / Región"],["country","País"],
  ["postal","Código postal"],["timezone","Zona horaria"],["isp","Proveedor (ISP)"],["org","Organización"],
  ["asn","ASN"],["coords","Coordenadas"],
];

async function getJSON(url, ms=9000){
  const r = await fetch(url, {signal: AbortSignal.timeout(ms), cache:"no-store"});
  if (!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}

async function fetchIP4(){
  try { return (await getJSON("https://api.ipify.org?format=json")).ip; } catch { return null; }
}
async function fetchIP6(){
  // api6 solo responde por IPv6; api64 responde v6 si existe, si no v4.
  try { const ip = (await getJSON("https://api6.ipify.org?format=json", 6000)).ip; if (ip && ip.includes(":")) return ip; } catch {}
  try { const ip = (await getJSON("https://api64.ipify.org?format=json", 6000)).ip; if (ip && ip.includes(":")) return ip; } catch {}
  return null;
}

function normWho(d){
  return { ip:d.ip, city:d.city, region:d.region, country:`${d.country} (${d.country_code})`, postal:d.postal||"—",
    timezone: d.timezone ? `${d.timezone.id} (UTC${d.timezone.utc})` : "—",
    isp:d.connection?.isp||"—", org:d.connection?.org||"—",
    asn: d.connection?.asn ? `AS${d.connection.asn}` : "—",
    lat:d.latitude, lon:d.longitude, coords:`${d.latitude}, ${d.longitude}` };
}
function normApi(d){
  return { ip:d.ip, city:d.city, region:d.region, country:`${d.country_name} (${d.country_code})`, postal:d.postal||"—",
    timezone: d.timezone ? `${d.timezone} (UTC${d.utc_offset||""})` : "—",
    isp:d.org||"—", org:d.org||"—", asn:d.asn||"—",
    lat:d.latitude, lon:d.longitude, coords:`${d.latitude}, ${d.longitude}` };
}
async function fetchInfo(ip){
  try { const d = await getJSON(`https://ipwho.is/${ip}`); if (d.success!==false) return normWho(d); } catch {}
  try { const d = await getJSON(`https://ipapi.co/${ip}/json/`); if (!d.error) return normApi(d); } catch {}
  return null;
}

function setIP(id, ip){
  const el = document.getElementById(id);
  if (ip){ el.textContent = ip; el.classList.remove("none"); }
  else { el.textContent = id==="ip6" ? "Sin IPv6 pública en esta red" : "No disponible"; el.classList.add("none"); }
}

function renderRows(){
  const info = S.info[S.tab];
  const rows = document.getElementById("rows");
  if (!info){
    const ip = S.tab==="v4" ? S.ip4 : S.ip6;
    rows.innerHTML = `<div class="status" style="padding:12px 0">${ip ? "Cargando detalles…" : (S.tab==="v6" ? "Tu red no expone una IPv6 pública, por lo que no hay detalles que mostrar." : "Sin datos.")}</div>`;
    return;
  }
  rows.innerHTML = FIELDS.map(([k,label])=>`
    <div class="row"><div class="k">${label}</div><div class="v" id="f-${k}">${info[k]??"—"}</div><button class="copy" data-copy="f-${k}">Copiar</button></div>`).join("");
}

function renderMap(){
  const info = S.info[S.tab] || S.info.v4 || S.info.v6;
  if (!info || info.lat==null) return;
  if (!S.map){
    S.map = L.map("map", {zoomControl:false, attributionControl:true}).setView([info.lat, info.lon], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenStreetMap"}).addTo(S.map);
    L.control.zoom({position:"bottomright"}).addTo(S.map);
  } else S.map.setView([info.lat, info.lon], 10);
  if (S.marker) S.marker.remove();
  S.marker = L.circleMarker([info.lat, info.lon], {radius:9, color:"#4fd1c5", fillColor:"#4fd1c5", fillOpacity:.5}).addTo(S.map)
    .bindPopup(`${info.city}, ${info.region}<br>${info.country}`).openPopup();
  L.circle([info.lat, info.lon], {radius:15000, color:"#4fd1c5", weight:1, fillOpacity:.06}).addTo(S.map);
}

async function load(){
  const st = document.getElementById("status");
  st.className="status"; st.textContent="Consultando…";
  ["ip4","ip6"].forEach(id=>{ document.getElementById(id).innerHTML='<div class="skeleton"></div>'; });
  S.info = {v4:null, v6:null};
  renderRows();

  const [ip4, ip6] = await Promise.all([fetchIP4(), fetchIP6()]);
  S.ip4 = ip4; S.ip6 = ip6;
  setIP("ip4", ip4); setIP("ip6", ip6);
  if (!ip4 && !ip6){ st.className="status err"; st.textContent="No se pudo consultar la IP. Revisa tu conexión."; return; }

  const [i4, i6] = await Promise.all([ip4 ? fetchInfo(ip4) : null, ip6 ? fetchInfo(ip6) : null]);
  S.info.v4 = i4; S.info.v6 = i6;
  renderRows(); renderMap();
  st.textContent = "Actualizado " + new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
}

async function copyText(txt, btn, okLabel="Copiado"){
  try { await navigator.clipboard.writeText(txt); }
  catch { const ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  if (btn){ const old=btn.textContent; btn.textContent=okLabel; btn.classList.add("ok"); setTimeout(()=>{btn.textContent=old; btn.classList.remove("ok");},1300); }
}

function summary(){
  const lines = [];
  lines.push(`IPv4: ${S.ip4||"—"}`);
  lines.push(`IPv6: ${S.ip6||"—"}`);
  for (const [key,label] of [["v4","IPv4"],["v6","IPv6"]]){
    const i = S.info[key]; if (!i) continue;
    lines.push(""); lines.push(`Detalles ${label}:`);
    FIELDS.slice(1).forEach(([k,l])=>lines.push(`  ${l}: ${i[k]??"—"}`));
  }
  return lines.join("\n");
}

document.addEventListener("click", e=>{
  const c = e.target.closest("[data-copy]");
  if (c){ const el=document.getElementById(c.dataset.copy); if (el && !el.classList.contains("none")) copyText(el.textContent.trim(), c); return; }
  const t = e.target.closest(".tab");
  if (t){ S.tab=t.dataset.t; document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("on",x===t)); renderRows(); renderMap(); }
});
document.getElementById("copyall").onclick = e => copyText(summary(), e.target, "Todo copiado");
document.getElementById("refresh").onclick = load;

load();
