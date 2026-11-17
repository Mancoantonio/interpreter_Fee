'use strict';
// CONFIGURACIÓN: todos los valores monetarios internos se manejan en centavos.
const GOAL_CENTS = 5000;
const RATE_CENTS = 12;  // US$0.12 por minuto facturable; no se agrega surge.
const TARGET_MINUTES = Math.ceil(GOAL_CENTS / RATE_CENTS); // 417
const $ = id => document.getElementById(id);
const money = cents => '$' + (cents / 100).toFixed(2);
const milestonePercentages = [25, 50, 75, 100];

// La fecha sirve de ancla. No se suman Customer IDs, fechas, horas ni importes.
// Se detiene justo en el símbolo $, antes del pago (que puede estar unido al próximo ID).
const rowPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}:\d{2}\s*[AP]M)\s*(\d+)\s*(Yes|No)\s*(Yes|No)\s*\$/gi;

function readPayment(tail, expectedCents, isLast) {
  const txt = tail.trimStart();
  // Separado por salto de línea: el importe termina antes del siguiente Customer ID.
  const firstLine = txt.split(/[\r\n]/, 1)[0].trim();
  if (firstLine && /^\d+(?:[.,]\d{1,2})?$/.test(firstLine)) {
    return { cents: Math.round(Number(firstLine.replace(',', '.')) * 100), reliable: true };
  }
  // Si no hay otro registro, toda la cola puede ser el importe sin concatenación.
  if (isLast && /^\d+(?:[.,]\d{1,2})?$/.test(txt)) {
    return { cents: Math.round(Number(txt.replace(',', '.')) * 100), reliable: true };
  }
  // Formato compacto sin separadores: se utiliza la tarifa base como referencia
  // para separar el pago del ID de la siguiente fila. La verificación monetaria
  // es indeterminada, ya que esos caracteres son inherentemente ambiguos.
  const canonical = (expectedCents / 100).toFixed(2);
  const variants = [canonical, canonical.replace(/0+$/, '').replace(/\.$/, '')];
  if (variants.some(v => txt.startsWith(v))) return { cents: expectedCents, reliable: false };
  const guess = txt.match(/^(\d+)(?:[.,](\d{1,2}))?/);
  if (!guess) return { cents: null, reliable: false };
  const parsed = Number(guess[1] + (guess[2] ? '.' + guess[2] : ''));
  return { cents: Math.round(parsed * 100), reliable: false };
}

function parseReport(input) {
  const found = [...input.matchAll(rowPattern)];
  const rows = [];
  for (let i = 0; i < found.length; i++) {
    const m = found[i];
    const minutes = Number(m[3]);
    const billable = m[4].toLowerCase() === 'yes';
    const dropped = m[5].toLowerCase() === 'yes';
    const payStart = m.index + m[0].length;
    const nextStart = i + 1 < found.length ? found[i + 1].index : input.length;
    const payData = readPayment(input.slice(payStart, nextStart), minutes * RATE_CENTS, i === found.length - 1);
    rows.push({ date: m[1], time: m[2], minutes, billable, dropped, paymentCents: payData.cents, paymentReliable: payData.reliable });
  }
  const billableRows = rows.filter(r => r.billable);
  const minutes = billableRows.reduce((sum, r) => sum + r.minutes, 0);
  const earnedCents = minutes * RATE_CENTS;
  const confident = billableRows.every(r => r.paymentReliable && r.paymentCents !== null);
  const listedCents = billableRows.reduce((sum, r) => sum + (r.paymentCents || 0), 0);
  const dates = [...new Set(rows.map(r => r.date))];
  return {
    rows, dates, minutes, earnedCents, earnings: earnedCents / 100,
    calls: rows.length, nonBillable: rows.length - billableRows.length,
    dropped: rows.filter(r => r.dropped).length,
    remainingMinutes: Math.max(0, TARGET_MINUTES - minutes),
    remainingCents: Math.max(0, GOAL_CENTS - earnedCents),
    payMismatch: confident && listedCents !== earnedCents,
    paymentVerified: confident, listedCents
  };
}

let victoryCelebrated = false;
let lastCelebratedMilestone = 0;
let initialRender = true;
let latest = null;
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function confetti(colors=['#facc15','#ffffff','#93c5fd'], amount=95) {
  if (reduceMotion) return;
  const canvas = $('confetti'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * ratio); canvas.height = Math.floor(h * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const bits = Array.from({length:amount},()=>({
    x:Math.random()*w, y:-Math.random()*h*.7,
    vx:(Math.random()-.5)*3,vy:2+Math.random()*5,
    s:2.5+Math.random()*5,c:colors[Math.floor(Math.random()*colors.length)],rot:Math.random()*6
  }));
  let frames=0;
  function animate() {
    ctx.clearRect(0,0,w,h);
    for (const b of bits) {
      b.x+=b.vx;b.y+=b.vy;b.rot+=.08;
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);ctx.fillStyle=b.c;
      ctx.fillRect(-b.s/2,-b.s/2,b.s,b.s*1.7);ctx.restore();
    }
    if (++frames<130) requestAnimationFrame(animate);
    else ctx.clearRect(0,0,w,h);
  }
  requestAnimationFrame(animate);
}

function milestoneCopy(pct, remainingToNext, next, completed) {
  if (completed) return {
    badge:'QUEST CLEARED',title:'BOSS DEFEATED · 100%',
    description:'US$50 conquistados. Ya no persigues la meta: la meta te tiene miedo.',
    hype:'La barra se puso verde. El jefe final está cobrando horas extra.'
  };
  if (remainingToNext<=10) return {
    badge:'CRITICAL HIT', title:`CHECKPOINT ${next}%`,
    description:`A ${remainingToNext} minuto${remainingToNext===1?'':'s'} del próximo desbloqueo. Esto está a punto de explotar.`,
    hype:'El siguiente nivel ya está escribiendo su carta de rendición.'
  };
  if (remainingToNext<=25) return {
    badge:'HOT STREAK',title:`CHECKPOINT ${next}%`,
    description:`Solo ${remainingToNext} minutos separan tu barra del ${next}%. Ya le estás golpeando la puerta.`,
    hype:'Una buena llamada y el siguiente checkpoint pierde la dignidad.'
  };
  if (remainingToNext<=60) return {
    badge:'ON FIRE',title:`CHECKPOINT ${next}%`,
    description:`Faltan ${remainingToNext} minutos para llegar al ${next}%. No está regalado, pero está MUY jugable.`,
    hype:'El contador se está poniendo nervioso. Que siga la partida.'
  };
  return {
    badge:'GRIND MODE',title:`CHECKPOINT ${next}%`,
    description:`Faltan ${remainingToNext} minutos para alcanzar el ${next}%. Todavía queda mapa por explorar.`,
    hype:pct<25?'Primer checkpoint a la vista. Los minutos no se farmean solos.':'La barra blanca aún tiene cuentas pendientes.'
  };
}

function render(data) {
  latest = data;
  const pct = data.earnedCents / GOAL_CENTS * 100;
  const done = data.earnedCents >= GOAL_CENTS;
  const capped = Math.min(100,pct);
  const level = done?5:pct>=75?4:pct>=50?3:pct>=25?2:1;
  const names=['','ROOKIE','RISING STAR','PRO INTERPRETER','ELITE','VETERANS DAY CHAMPION'];
  $('money').textContent = money(data.earnedCents);
  $('money').classList.toggle('completed',done);
  $('pct').textContent = pct.toFixed(2)+'%';
  $('fill').style.width = capped+'%';
  $('fill').classList.toggle('done',done);
  $('progress').setAttribute('aria-valuenow',capped.toFixed(2));
  $('mins').textContent = data.minutes;
  $('remaining').textContent = data.remainingMinutes;
  $('calls').textContent = data.calls;
  $('moneyRemaining').textContent = money(data.remainingCents);
  $('level').textContent = `LEVEL ${level} · ${names[level]}`;
  $('status').textContent=done?'MISSION COMPLETE':'MISSION ACTIVE';
  $('status').classList.toggle('done',done);
  $('remainingTile').classList.toggle('complete',done);
  $('bossPanel').classList.toggle('done',done);
  $('bossMinutes').textContent = data.remainingMinutes;
  $('bossTitle').textContent = done?'BOSS FINAL DERROTADO · 100%':'MINUTOS PARA EL BOSS FINAL (100%)';
  $('bossNote').textContent = done
    ? `Meta cumplida. Excedente: ${money(Math.max(0,data.earnedCents-GOAL_CENTS))}.`
    : `Te faltan ${data.remainingMinutes} minutos facturables y ${money(data.remainingCents)} para alcanzar US$50.`;
  const current = milestonePercentages.filter(p=>pct>=p).at(-1)||0;
  const next = milestonePercentages.find(p=>pct<p)||100;
  const nextMinutes = Math.ceil((GOAL_CENTS * next / 100) / RATE_CENTS);
  const remainingToNext = Math.max(0,nextMinutes-data.minutes);
  const copy = milestoneCopy(pct,remainingToNext,next,done);
  $('mission').textContent=copy.title;
  $('achievementBadge').textContent=copy.badge;
  $('hint').textContent=copy.description;
  $('hype').textContent=copy.hype;
  $('achievement').classList.toggle('victory',done);
  $('achievement').classList.toggle('glow',!done && remainingToNext<=25);
  const prevMinute = Math.ceil((GOAL_CENTS * current / 100) / RATE_CENTS);
  const segmentLength = Math.max(1,nextMinutes-prevMinute);
  const segmentPct = done?100:Math.min(100,Math.max(0,(data.minutes-prevMinute)/segmentLength*100));
  $('milestoneFill').style.width=segmentPct+'%';
  $('currentCheckpoint').textContent=current+'% desbloqueado';
  $('nextCheckpoint').textContent=done?'TODOS LOS LOGROS DESBLOQUEADOS':`Próximo: ${next}% · ${remainingToNext} min`;
  milestonePercentages.forEach(p=>$('m'+p).classList.toggle('hit',pct>=p));
  $('details').textContent = `${data.calls} llamadas detectadas · ${data.nonBillable} no facturables · ${data.dropped} interrumpidas · ${data.minutes} minutos facturables · ${money(data.earnedCents)} calculados a tarifa base.`;

  // Tiembla solo al pasar de estar bajo la meta a completarla, nunca al reanalizar.
  if (!initialRender && done && !victoryCelebrated && data.calls > 0 && !reduceMotion) {
    const panel = $('panel');
    panel.classList.remove('boss-shake');
    void panel.offsetWidth; // Reinicia la animación CSS.
    panel.classList.add('boss-shake');
  }
  // Solo celebra cuando avanzas de checkpoint o llegas al 100%; no cada recálculo.
  if (!initialRender && current>lastCelebratedMilestone && data.calls>0) {
    confetti(done?['#22c55e','#86efac','#ffffff','#facc15']:['#facc15','#ffffff','#93c5fd'],done?170:65);
  }
  lastCelebratedMilestone=current;
  if (done && !victoryCelebrated) victoryCelebrated=true;
  if (!done) victoryCelebrated=false;
  initialRender=false;
}
function displayWarnings(data) {
  const warnings=[];
  if (data.payMismatch) warnings.push(`Atención: los pagos detallados suman ${money(data.listedCents)}, pero a US$0.12/min corresponden ${money(data.earnedCents)}. Se usa siempre la tarifa base.`);
  if (!data.paymentVerified && data.calls) warnings.push('Registro compacto: el pago puede estar pegado al siguiente Customer ID; los importes impresos no se usan para calcular el total. Se suman solo los minutos facturables.');
  if (data.dates.length>1) warnings.push('Atención: detecté varias fechas ('+data.dates.join(', ')+'). Se sumaron todos los registros pegados.');
  $('warning').textContent=warnings.join('\n');
}
function analyze() {
  const raw = $('raw').value;
  const data = parseReport(raw);
  if (!data.calls) {
    $('warning').textContent = raw.trim()?'No pude detectar llamadas. El registro debe contener fecha, hora, minutos, Yes/No, Yes/No y $pago por fila.':'Pega un reporte para comenzar.';
    if (!raw.trim()) reset();
    return;
  }
  render(data);
  displayWarnings(data);
  $('money').classList.remove('pop');void $('money').offsetWidth;$('money').classList.add('pop');
}
function reset() {
  lastCelebratedMilestone=0;
  $('panel').classList.remove('boss-shake');
  render({dates:[],minutes:0,earnedCents:0,remainingMinutes:TARGET_MINUTES,remainingCents:GOAL_CENTS,calls:0,nonBillable:0,dropped:0,payMismatch:false,paymentVerified:true,listedCents:0});
  $('details').textContent='Esperando datos.';
  $('warning').textContent='';
}
$('panel').addEventListener('animationend',e=>{if(e.animationName==='bossShake')$('panel').classList.remove('boss-shake')});
$('parse').addEventListener('click',analyze);
$('clear').addEventListener('click',()=>{$('raw').value='';reset();$('raw').focus()});
let pending;
$('raw').addEventListener('input',()=>{clearTimeout(pending);pending=setTimeout(analyze,240)});
reset();
// Interfaz de prueba desde la consola para verificar reportes sin modificar la UI.
window.parsePropioReport=parseReport;
