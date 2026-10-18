/* YULA KİLİT hesaplama güncellemesi: hücre mesafesi tam hassasiyet, süre katsayısı 514.2. */
const SOLDIERS={
  Selçuklu:{
    Gulam:66,
    Kemankeş:66,
    'Selçuk Bey':54,
    Alparslan:75,
    Kargılı:90,
    'Atlı Okçu':135,
    Sipahi:105,
    Mancınık:25,
    Top:15
  },
  Hun:{
    Toygun:72,
    Kemankeş:72,
    Tarık:60,
    Barlas:81,
    Tunga:120,
    Talakan:150,
    Tarkan:120,
    Mancınık:25,
    Top:15
  },
  Göktürk:{
    Karabudun:54,
    Kemankeş:60,
    Topukçu:48,
    'Mavi Kurt':75,
    Muhafız:90,
    'Mavi Atlı':120,
    Kürşat:90,
    Mancınık:25,
    Top:15
  }
};

const HUN_SPEED_BONUS=1.10;
const YULA_FACTOR=514.2; // Yula'da doğrulanan hücre başına süre katsayısı

let villages=JSON.parse(localStorage.getItem('umaykut_villages')||'[]'),
    enemy={race:'',name:'',speed:0},
    mine={race:'',name:'',speed:0};

const $=id=>document.getElementById(id);

function save(){
  localStorage.setItem('umaykut_villages',JSON.stringify(villages));
  renderVillages();
}

function addVillage(){
  let name=$('vname').value.trim(),
      x=$('vx').value.trim(),
      y=$('vy').value.trim();

  if(!name||!x||!y)return alert('Köy adı, X ve Y gir.');
  if(villages.length>=10)return alert('En fazla 10 köy kaydedebilirsin.');

  villages.push({name,x,y});
  save();
  ['vname','vx','vy'].forEach(id=>$(id).value='');
}

function renderVillages(){
  let list=$('villages');

  list.innerHTML=villages.length
    ? villages.map((v,i)=>`
      <div class="row" style="margin:5px 0">
        <select>
          <option>${v.name} (${v.x}, ${v.y})</option>
        </select>
        <button class="btn secondary" style="max-width:65px"
          onclick="villages.splice(${i},1);save()">Sil</button>
      </div>`).join('')
    : '<div class="empty">Henüz köy kaydedilmedi.</div>';

  let s=$('sourceVillage');
  s.innerHTML=villages.length
    ? villages.map((v,i)=>`<option value="${i}">${v.name} — ${v.x}, ${v.y}</option>`).join('')
    : '<option value="">Köy seç</option>';

  if(villages.length)s.value='0';

  let t=$('targetVillage');
  if(t){
    t.innerHTML='<option value="">Kayıtlı köy seç...</option>'+
      villages.map((v,i)=>`<option value="${i}">${v.name} — ${v.x}, ${v.y}</option>`).join('');
  }
}

function syncTargetVillage(){
  let t=$('targetVillage');
  if(!t)return;

  let i=t.value;
  if(i==='')return;

  let v=villages[+i];
  if(!v)return;

  $('tx').value=v.x;
  $('ty').value=v.y;
}

function selectorHTML(kind,race){
  let st=kind==='enemy'?enemy:mine;
  race=race||st.race||'Selçuklu';

  return `
    <div class="chips">
      ${Object.keys(SOLDIERS).map(r=>`
        <button type="button" class="chip ${r===race?'active':''}"
          onclick='showRace(${JSON.stringify(kind)},${JSON.stringify(r)})'>${r}</button>
      `).join('')}
    </div>
    <div class="soldier-list">
      ${Object.entries(SOLDIERS[race]).map(([n,s])=>`
        <button type="button" class="soldier-btn"
          onclick='pick(${JSON.stringify(kind)},${JSON.stringify(race)},${JSON.stringify(n)},${s})'>
          ${n}<strong>${s}</strong>
        </button>
      `).join('')}
    </div>`;
}

function toggleSelector(kind){
  let el=$(kind==='enemy'?'enemySelector':'mineSelector');
  el.hidden=!el.hidden;

  if(!el.hidden)el.innerHTML=selectorHTML(kind);
}

function showRace(kind,r){
  $(kind==='enemy'?'enemySelector':'mineSelector').innerHTML=selectorHTML(kind,r);
}

function pick(kind,r,n,s){
  let st=kind==='enemy'?enemy:mine;

  Object.assign(st,{race:r,name:n,speed:s});

  $(kind==='enemy'?'enemyBtn':'mineBtn').textContent=`${n} • ${s}`;
  $(kind==='enemy'?'enemySelector':'mineSelector').hidden=true;
}

/* Yula Online:
   Referans testleri:
   181,247 -> 186,253 | Barlas | 00:45
   181,247 -> 193,241 | Kemankeş | 01:27
   181,247 -> 238,260 | Barlas | 05:37
   181,247 -> 177,249 | Barlas 26s / Tarkan 17s / Kemankeş 29s

   Etkin hız = asker hızı.
   Hun'da server bonusu nedeniyle etkin hız = temel hız × 1.10.
   Süre = mesafe × 514.2 / etkin hız; mesafe tam hassasiyette kullanılır.
*/

function effectiveSpeed(st){
  if(!st || !st.speed)return 0;
  return st.race==='Hun' ? st.speed*HUN_SPEED_BONUS : st.speed;
}

function dist(x1,y1,x2,y2){
  // Hücre mesafesini koordinatlardan tam hassasiyetle hesapla.
  return Math.hypot(x2-x1,y2-y1);
}

function sec(distance,s,diamond=false){
  if(!Number.isFinite(distance)||distance<0||!Number.isFinite(s)||s<=0)return 0;
  // Süre hesabında ekranda gösterilen 1 ondalıklı mesafeyi değil, tam mesafeyi kullan.
  let raw=distance*YULA_FACTOR/s;
  if(diamond)raw/=2;
  // Şimdiki model: elmas uygulanır, ardından oyun süresi en yakın tam saniyeye yuvarlanır.
  return Math.round(raw);
}

function fmtCells(distance){
  return distance.toFixed(1).replace('.',',');
}

function fmt(v){
  v=Math.max(0,Math.round(v));
  let h=Math.floor(v/3600),
      m=Math.floor(v%3600/60),
      s=v%60;

  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');
}

function time(){
  let h=+$('ah').value,
      m=+$('am').value,
      s=+$('as').value;

  if(h>23||m>59||s>59||h<0||m<0||s<0)
    throw Error('Saat 00:00:00–23:59:59 aralığında olmalı.');

  let d=new Date();
  d.setHours(h,m,s,0);
  return d;
}

function ts(d){
  return d.toLocaleTimeString('tr-TR',{hour12:false});
}

function parseNumericInput(id){
  const raw=$(id).value.trim();
  if(raw==='') return NaN;
  // Oyuncu hücreyi Türkçe virgülle de yazabilir: 53,2.
  return Number(raw.replace(',', '.'));
}

function toggleDistanceMode(kind){
  const mode=$(kind==='enemy'?'enemyDistanceMode':'ownDistanceMode');
  const wrap=$(kind==='enemy'?'enemyCellsWrap':'ownCellsWrap');
  if(mode && wrap) wrap.hidden=mode.value!=='cells';
}

function calculate(){
  try{
    if(!enemy.speed||!mine.speed)
      throw Error('Önce düşman ve kendi askerini seç.');

    const enemyMode=$('enemyDistanceMode')?$('enemyDistanceMode').value:'coords';
    const ownMode=$('ownDistanceMode')?$('ownDistanceMode').value:'coords';
    const enemyCoordsNeeded=ownMode==='coords';
    const exRaw=$('ex').value.trim(), eyRaw=$('ey').value.trim();
    let ex=exRaw===''?NaN:Number(exRaw), ey=eyRaw===''?NaN:Number(eyRaw);
    const coordinatesAvailable=Number.isFinite(ex)&&Number.isFinite(ey);
    const a=time();

    // Enemy travel: either calculate from coordinates or use a manually entered cell distance.
    let enemyDistance;
    if(enemyMode==='cells'){
      enemyDistance=parseNumericInput('enemyCells');
      if(!Number.isFinite(enemyDistance)||enemyDistance<0)
        throw Error('Düşman yolculuğu için geçerli hücre mesafesi gir. Örnek: 31,0');
    }else{
      if(!coordinatesAvailable)
        throw Error('Düşmanın köyünün X ve Y koordinatlarını gir.');
      const sourceIndex=$('sourceVillage').value;
      const source=villages[+sourceIndex];
      if(!source)
        throw Error('Düşmanın saldırdığı senin köyünü seç.');
      enemyDistance=dist(ex,ey,+source.x,+source.y);
    }

    let enemyLeg=sec(enemyDistance,effectiveSpeed(enemy),$('diamond').checked);
    const dep=new Date(a.getTime()-enemyLeg*1000);
    const ret=new Date(a.getTime()+enemyLeg*1000);

    // Our outgoing travel: independently choose coordinates or a manual cell distance.
    let ownDistance;
    if(ownMode==='cells'){
      ownDistance=parseNumericInput('ownCells');
      if(!Number.isFinite(ownDistance)||ownDistance<0)
        throw Error('Bizim saldırımız için geçerli hücre mesafesi gir. Örnek: 53,2');
    }else{
      if(!coordinatesAvailable)
        throw Error('Bizim saldırı mesafesini koordinatla hesaplamak için düşman köyünün X ve Y koordinatlarını gir.');

      let tx,ty;
      const targetSelect=$('targetVillage');
      if(targetSelect && targetSelect.value!==''){
        const target=villages[+targetSelect.value];
        if(!target) throw Error('Saldıracağın kayıtlı köyü seç.');
        tx=+target.x;
        ty=+target.y;
      }else{
        const txRaw=$('tx').value.trim(), tyRaw=$('ty').value.trim();
        if(txRaw===''||tyRaw==='')
          throw Error('Düşmana saldıracağın köyün X ve Y koordinatlarını gir veya hücre mesafesi seç.');
        tx=Number(txRaw); ty=Number(tyRaw);
      }
      if(!Number.isFinite(tx)||!Number.isFinite(ty))
        throw Error('Saldıracağın köyün X ve Y koordinatları sayı olmalı.');
      ownDistance=dist(tx,ty,ex,ey);
    }

    const ownLeg=sec(ownDistance,effectiveSpeed(mine),$('mineDiamond').checked);
    const send=new Date(ret.getTime()-ownLeg*1000);

    $('results').innerHTML=`
      <div class="box">
        <div class="k">Düşman gidiş</div>
        <div class="v">${fmt(enemyLeg)}</div>
      </div>
      <div class="box">
        <div class="k">Düşman mesafesi</div>
        <div class="v">${fmtCells(enemyDistance)} hücre</div>
      </div>
      <div class="box">
        <div class="k">Düşman çıkış</div>
        <div class="v">${ts(dep)}</div>
      </div>
      <div class="box">
        <div class="k">Düşman varış</div>
        <div class="v">${ts(a)}</div>
      </div>
      <div class="box">
        <div class="k">Düşman dönüş</div>
        <div class="v">${ts(ret)}</div>
      </div>
      <div class="box">
        <div class="k">Senin yol</div>
        <div class="v">${fmt(ownLeg)}</div>
      </div>
      <div class="box">
        <div class="k">Senin mesafen</div>
        <div class="v">${fmtCells(ownDistance)} hücre</div>
      </div>
      <div class="box full">
        <div class="k">Senin gönderme saatin</div>
        <div class="v">${ts(send)}</div>
      </div>`;
  }catch(e){
    alert(e.message);
  }
}
function clearAll(){
  ['ex','ey','tx','ty','ah','am','as','enemyCells','ownCells'].forEach(id=>{
    if($(id))$(id).value='';
  });

  if($('targetVillage'))$('targetVillage').value='';
  if($('enemyDistanceMode'))$('enemyDistanceMode').value='coords';
  if($('ownDistanceMode'))$('ownDistanceMode').value='coords';
  toggleDistanceMode('enemy');
  toggleDistanceMode('own');

  enemy={race:'',name:'',speed:0};
  mine={race:'',name:'',speed:0};

  $('enemyBtn').textContent='Asker seç';
  $('mineBtn').textContent='Asker seç';
  $('diamond').checked=false;
  $('mineDiamond').checked=false;
  $('results').innerHTML='<div class="empty">Hesaplama bekleniyor...</div>';
}

renderVillages();
toggleDistanceMode('enemy');
toggleDistanceMode('own');
