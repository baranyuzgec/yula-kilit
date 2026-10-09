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
const YULA_FACTOR=513.5;

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
   Süre = mesafe × 513.5 / etkin hız.
*/

function effectiveSpeed(st){
  if(!st || !st.speed)return 0;
  return st.race==='Hun' ? st.speed*HUN_SPEED_BONUS : st.speed;
}

function dist(x1,y1,x2,y2){
  return Math.sqrt((x2-x1)**2+(y2-y1)**2);
}

function sec(x1,y1,x2,y2,s){
  if(!s)return 0;
  return Math.round(dist(x1,y1,x2,y2)*(YULA_FACTOR/s));
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

function calculate(){
  try{
    if(!enemy.speed||!mine.speed)
      throw Error('Önce düşman ve kendi askerini seç.');

    let sourceIndex=$('sourceVillage').value;
    let source=villages[+sourceIndex];

    if(!source)
      throw Error('Senin köyünü seç.');

    let ex=+$('ex').value,
        ey=+$('ey').value,
        a=time();

    if(!Number.isFinite(ex)||!Number.isFinite(ey))
      throw Error('Düşmanın köyünün X ve Y koordinatlarını gir.');

    /* Düşmanın saldırdığı bizim köyümüz:
       source -> enemy */
    let enemyLeg=sec(
      ex,ey,
      +source.x,+source.y,
      effectiveSpeed(enemy)
    );

    if($('diamond').checked)enemyLeg/=2;

    let dep=new Date(a.getTime()-enemyLeg*1000);
    let ret=new Date(a.getTime()+enemyLeg*1000);

    /* Bizim düşmana saldıracağımız köy:
       target -> enemy */
    let tx,ty;

    let targetSelect=$('targetVillage');
    if(targetSelect && targetSelect.value!==''){
      let target=villages[+targetSelect.value];
      if(!target)throw Error('Saldıracağın köyü seç.');

      tx=+target.x;
      ty=+target.y;
    }else{
      tx=+$('tx').value;
      ty=+$('ty').value;
    }

    if(!Number.isFinite(tx)||!Number.isFinite(ty))
      throw Error('Düşmana saldıracağın köyün X ve Y koordinatlarını gir.');

    let ownLeg=sec(
      tx,ty,
      ex,ey,
      effectiveSpeed(mine)
    );

    if($('mineDiamond').checked)ownLeg/=2;

    let send=new Date(ret.getTime()-ownLeg*1000);

    $('results').innerHTML=`
      <div class="box">
        <div class="k">Düşman gidiş</div>
        <div class="v">${fmt(enemyLeg)}</div>
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
      <div class="box full">
        <div class="k">Senin gönderme saatin</div>
        <div class="v">${ts(send)}</div>
      </div>`;
  }catch(e){
    alert(e.message);
  }
}

function clearAll(){
  ['ex','ey','tx','ty','ah','am','as'].forEach(id=>{
    if($(id))$(id).value='';
  });

  if($('targetVillage'))$('targetVillage').value='';

  enemy={race:'',name:'',speed:0};
  mine={race:'',name:'',speed:0};

  $('enemyBtn').textContent='Asker seç';
  $('mineBtn').textContent='Asker seç';
  $('diamond').checked=false;
  $('mineDiamond').checked=false;
  $('results').innerHTML='<div class="empty">Hesaplama bekleniyor...</div>';
}

renderVillages();
