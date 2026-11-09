/* YULA KİLİT: tam hassasiyetli mesafe ve süre hesabı; yeni sunucu katsayısı 1800. */
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
const YULA_FACTOR=1800; // Yeni sunucunun tüm devletlerde kullanılan ortak süre katsayısı

let villageStorageKey='umaykut_villages',
    villages=JSON.parse(localStorage.getItem('umaykut_villages')||'[]'),
    enemy={race:'',name:'',speed:0},
    mine={race:'',name:'',speed:0};

const $=id=>document.getElementById(id);


function loadVillagesForUser(userId){
  // Köy listelerini aynı cihazdaki farklı üyeler arasında ayır.
  villageStorageKey=`umaykut_villages_${userId}`;
  let saved=localStorage.getItem(villageStorageKey);
  if(saved===null && localStorage.getItem('umaykut_villages')!==null && !localStorage.getItem('umaykut_villages_migrated')){
    saved=localStorage.getItem('umaykut_villages');
    localStorage.setItem(villageStorageKey,saved);
    localStorage.setItem('umaykut_villages_migrated','1');
    localStorage.removeItem('umaykut_villages');
  }
  try{villages=saved?JSON.parse(saved):[];if(!Array.isArray(villages))villages=[];}
  catch(_){villages=[];}
  renderVillages();
}

function save(){
  localStorage.setItem(villageStorageKey,JSON.stringify(villages));
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

/* Yeni sunucu doğrulama örnekleri:
   Hun 71.2 hücre: Toygun/Okçu 26:58, Tarık 32:22, Talakan 12:57.
   Göktürk (611,61) -> (610,48), Kemankeş: 06:31.

   Askerlerin kayıtlı temel hızları korunur.
   Hun'da mevcut %10 bonus uygulanır.
   Süre = tam mesafe × 1800 / etkin hız.
   Mesafe ve süre ara adımlarda yuvarlanmaz; yalnızca ekranda gösterilirken yuvarlanır.
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
  // Ara hesaplamalarda saniyeyi yuvarlama. Tam hassasiyet fmt()/ts() aşamasına kadar korunur.
  return raw;
}

function fmtCells(distance){
  // Gerçek koordinat mesafesini 4 ondalığa kadar göster; hesapta tam değer korunur.
  return distance.toFixed(4).replace(/0+$/,'').replace(/\.$/,'').replace('.',',');
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
  // Saat gösteriminde en yakın saniyeye yuvarla; tarih hesabında ham süre korunur.
  const shown=new Date(Math.round(d.getTime()/1000)*1000);
  return shown.toLocaleTimeString('tr-TR',{hour12:false});
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
