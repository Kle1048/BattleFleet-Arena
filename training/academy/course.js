/* Standalone, offline educational interactions. No game connection or training. */
'use strict';
const $ = id => document.getElementById(id);
const ACTION_LABELS = ['Angreifen', 'Verfolgen', 'Umpositionieren', 'Waffensektor halten', 'Deckung suchen', 'Rückzug', 'Flugkörper ausweichen', 'Ziel ausschalten', 'Sea Control suchen'];
const fmt = (n, digits = 2) => n.toLocaleString('de-DE', {maximumFractionDigits: digits, minimumFractionDigits: digits});

function forward(policy, observation) {
  let values = observation;
  const stages = [];
  policy.layers.forEach((layer, index) => {
    values = layer.weight.map((row, j) => {
      let sum = layer.bias[j];
      for (let k = 0; k < row.length; k++) sum += row[k] * values[k];
      return index < 2 ? Math.tanh(sum) : sum;
    });
    stages.push(values);
  });
  const maximum = Math.max(...values);
  const exps = values.map(v => Math.exp(v - maximum));
  const total = exps.reduce((a, b) => a + b, 0);
  return {logits: values, probabilities: exps.map(v => v / total), stages};
}

function makeObservation(policy, scene, hp, targetHp, previous) {
  const o = Object.fromEntries(policy.features.map(f => [f, 0]));
  o.hp = hp / 100; o['heading.cos'] = 1; o['ownRadar.active'] = 1;
  o[`previous.${previous}`] = 1;
  if (scene === 'contact' || scene === 'missile') {
    Object.assign(o, {'target.present': 1, 'target.dx/2000': 0, 'target.dz/2000': 0.15,
      'target.hp': targetHp / 100, 'target.heading.sin': 1, 'target.heading.cos': 0,
      'target.distance/2000': 0.15, 'target.gunArc': 1, 'target.missileArc': 0,
      seaControl: 1, 'enemies/8': 1 / 8, danger: scene === 'missile' ? 0.8 : 0.2});
  } else {
    o['x/half'] = 0.4;
    if (scene === 'esm') Object.assign(o, {'ownRadar.active': 0, 'esm.count/8': 1 / 8,
      'esm.bearing.sin': -Math.SQRT1_2, 'esm.bearing.cos': Math.SQRT1_2});
  }
  if (scene === 'missile') Object.assign(o, {'incoming/8': 1 / 8,
    'nearestMissile.dx/1000': 0.1, 'nearestMissile.dz/1000': 0.05, 'nearestMissile.present': 1});
  return policy.features.map(f => Math.fround(Math.max(-1, Math.min(1, o[f]))));
}

function updateModel() {
  const entry = MODELS[$('model-profile').value], policy = entry.policy;
  const scene = $('model-scene').value;
  const hp = Number($('model-hp').value), target = Number($('model-target').value);
  $('model-hp-value').textContent = hp + ' %'; $('model-target-value').textContent = target + ' %';
  $('model-target').disabled = scene !== 'contact' && scene !== 'missile';
  const observation = makeObservation(policy, scene, hp, target, $('model-previous').value);
  const result = forward(policy, observation);
  const best = result.logits.indexOf(Math.max(...result.logits));
  $('model-choice').textContent = 'Rohe Argmax-Auswahl: ' + ACTION_LABELS[best] + ' (' + policy.actions[best] + ').';
  $('model-bars').replaceChildren(...result.probabilities.map((probability, i) => {
    const row = document.createElement('div'); row.className = 'bar-row' + (i === best ? ' winner' : '');
    const label = document.createElement('span'); label.textContent = ACTION_LABELS[i];
    const track = document.createElement('div'); track.className = 'track'; track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = probability * 100 + '%'; track.append(fill);
    const value = document.createElement('span'); value.textContent = fmt(probability * 100, 1) + ' %';
    row.append(label, track, value); return row;
  }));
  const table = document.createElement('table');
  const heading = table.insertRow();
  for (const text of ['Feature', 'Wert']) {const th = document.createElement('th'); th.textContent = text; heading.append(th);}
  policy.features.forEach((feature, i) => {const row = table.insertRow(); row.insertCell().textContent = feature; row.insertCell().textContent = fmt(observation[i], 4);});
  $('feature-list').replaceChildren(table);
  const first = policy.layers[0];
  const terms = observation.map((x, i) => ({name: policy.features[i], x, w: first.weight[0][i], product: x * first.weight[0][i]})).filter(t => t.x !== 0);
  const sum = terms.reduce((s, t) => s + t.product, first.bias[0]);
  $('neuron-calculation').textContent = 'Neuron 1, Schicht 1 — alle Nichtnull-Beiträge:\n' +
    terms.map(t => `${t.name}: ${fmt(t.x, 4)} × ${fmt(t.w, 4)} = ${fmt(t.product, 6)}`).join('\n') +
    `\nBias: ${fmt(first.bias[0], 6)}\nSumme vor Aktivierung: ${fmt(sum, 6)}\ntanh(Summe): ${fmt(Math.tanh(sum), 6)}\nAnzeige gerundet; intern wird mit ungerundeten Werten gerechnet.`;
  $('model-source').textContent = entry.path + '\nSHA-256: ' + entry.sha256 + '\nController: ' + policy.metadata.profileControllerVersion +
    '\nSnapshot eingebettet am 30.09.2026. Keine Verbindung zur laufenden Partie.';
}

function canvasContext(id) {
  const canvas = $(id), rect = canvas.getBoundingClientRect();
  const w = Math.max(280, rect.width), h = rect.height || 300, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  return {ctx, w, h};
}
function ocean(ctx, w, h) {
  ctx.fillStyle = '#0b202e'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#193747'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();}
  for (let y = 0; y < h; y += 40) {ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();}
  ctx.font = '14px system-ui'; ctx.fillStyle = '#e3edf2';
}
function ship(ctx, x, y, angle, color, ghost = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = ghost ? 0.4 : 1;
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(8, -3); ctx.lineTo(7, 16); ctx.lineTo(-7, 16); ctx.lineTo(-8, -3); ctx.closePath();
  if (ghost) {ctx.setLineDash([3, 3]); ctx.stroke();} else {ctx.fill(); ctx.fillStyle = '#142935'; ctx.fillRect(-4, -3, 8, 11);}
  ctx.restore();
}
function text(ctx, words, x, y, align = 'left', color = '#e3edf2') {ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(words, x, y);}
function line(ctx, x1, y1, x2, y2, color, dashed = false) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; if (dashed) ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function sensorState(distance, range, own, target) {return {precise: own && distance <= 600, esm: target && distance <= range};}
function drawSensor() {
  const d = Number($('sensor-distance').value), range = Number($('sensor-class').value);
  const own = $('own-radar').checked, target = $('target-radar').checked, teacher = $('teacher-view').checked;
  const s = sensorState(d, range, own, target);
  $('sensor-distance-value').textContent = d.toLocaleString('de-DE') + ' m';
  const {ctx, w, h} = canvasContext('sensor-canvas'); ocean(ctx, w, h);
  const x0 = 40, y0 = h * 0.6, scale = (w - 90) / 2700, xt = x0 + d * scale;
  if (own) {ctx.strokeStyle = '#72dfde'; ctx.beginPath(); ctx.arc(x0, y0, 600 * scale, 0, Math.PI * 2); ctx.stroke();}
  if (s.esm) line(ctx, x0, y0, w - 15, y0, '#ffc38b', true);
  ship(ctx, x0, y0, Math.PI / 2, '#72dfde');
  if (s.precise || teacher) ship(ctx, xt, y0, -Math.PI / 2, '#ff9e9e', !s.precise);
  text(ctx, 'Eigenes Schiff', 14, h - 24); text(ctx, own ? 'Aktives Radar: 600 m' : 'Aktives Radar: aus', 14, 28);
  text(ctx, s.precise ? 'Präziser Kontakt' : s.esm ? 'Nur Peilung → Entfernung unbekannt' : 'Kein Schiffskontakt', 14, 55);
  if (teacher) text(ctx, 'Gestricheltes Schiff = nur Lehransicht', 14, 82);
  $('sensor-status').textContent = s.precise ? 'Präzise Position, Kurs und HP verfügbar.' + (s.esm ? ' Zusätzlich ESM-Peilung.' : ' Keine ESM-Peilung.') : s.esm ? 'Nur Richtung und Kontaktkennung. Entfernung, Kurs und HP bleiben unbekannt.' : 'Kein präziser Kontakt und keine ESM-Peilung. Ein unsichtbares Schiff bleibt in der Spielwelt vorhanden.';
}

function rewardExample(zone, rear) {
  const score = zone * 5 + (60 - zone);
  return {score, values: [0.015, 0.020, 0.045].map(bonus => 0.015 * score + bonus * zone + 0.002 * rear)};
}
function updateReward() {
  const zone = Number($('reward-zone').value), rear = Number($('reward-rear').value), result = rewardExample(zone, rear);
  $('zone-value').textContent = zone + ' s'; $('rear-value').textContent = rear + ' s';
  $('reward-result').innerHTML = `<p>Spielpunkte: <strong>${result.score}</strong> · gemeinsamer Score-Reward: <strong>${fmt(result.score * 0.015)}</strong> · Heckbonus: <strong>${fmt(rear * 0.002, 3)}</strong></p><p>Gesamtreward in diesem Beispiel: Aggressiv <strong>${fmt(result.values[0], 3)}</strong> · Vorsichtig <strong>${fmt(result.values[1], 3)}</strong> · Auftrag <strong>${fmt(result.values[2], 3)}</strong></p>`;
}
function ppoExample(probability, advantage) {
  const ratio = probability / 0.2, clipped = Math.max(0.8, Math.min(1.2, ratio));
  return {ratio, raw: ratio * advantage, clipped: clipped * advantage, objective: Math.min(ratio * advantage, clipped * advantage)};
}
function updatePpo() {
  const probability = Number($('ppo-prob').value) / 100, advantage = Number($('ppo-adv').value);
  const r = ppoExample(probability, advantage);
  $('ppo-prob-value').textContent = fmt(probability * 100, 0) + ' %';
  $('ppo-result').innerHTML = `<div class="formula">Verhältnis ρ: ${fmt(r.ratio)}\nUngeclippt ρ × Â: ${fmt(r.raw)}\nGeclippt clip(ρ) × Â: ${fmt(r.clipped)}\nMinimum / PPO-Zielterm: ${fmt(r.objective)}</div>`;
}

const CLIP_TEXT = {
  lead: ['Ein bewegtes Ziel liegt quer vor dem eigenen Schiff. Seine jetzige Position ist bekannt.', 'Direktes Zielen hält auf diese alte Position. Das Ziel bewegt sich während der Flugzeit weiter.', 'Vorhalten berechnet einen zukünftigen Treffpunkt unter der Annahme konstanter Zielgeschwindigkeit.', 'Die orange gestrichelte Bahn verfehlt; die türkisfarbene Bahn erreicht hier den bewegten Kontakt. Im Spiel prüfen wir zusätzlich Startschiene und Suchkegel.'],
  sensor: ['Die Lehransicht kennt zwei Schiffe. Dieses Weltwissen bekommt die Policy nicht vollständig.', 'Bei 850 m Abstand reicht das eigene 600-m-Radar nicht. Das sendende FAC liefert lediglich eine ESM-Peilung.', 'Das Ziel schaltet sein Radar aus: Auch die Peilung verschwindet. Die Policy darf dessen Position nicht weiter präzise verwenden.', 'Innerhalb von 600 m erfasst das eigene aktive Radar das Ziel wieder – unabhängig davon, ob es selbst sendet.'],
  cycle: ['Der Actor verwandelt die Beobachtung in eine Verteilung über taktische Absichten.', 'Eine Aktion wird gezogen. Der programmierte Controller setzt die Absicht in Manöver und Waffenbefehle um.', 'Die Simulation liefert neue Beobachtung und Reward. Der Critic hilft einzuschätzen, ob das Ergebnis besser als erwartet war.', 'Nach einem Rollout verändert PPO Gewichte. Erst danach beginnt die nächste Datensammlung. Beim normalen Spielen bleiben die Gewichte fest.']
};
let clipTime = 0, clipPlaying = false, lastFrame = 0, lastStage = -1, animationId;
const CLIP_SECONDS = 24;
function drawClip() {
  const kind = $('clip-select').value, stage = Math.min(3, Math.floor(clipTime / 6));
  const {ctx, w, h} = canvasContext('clip-canvas'); ocean(ctx, w, h);
  text(ctx, `Schritt ${stage + 1} / 4`, 16, 26);
  if (kind === 'lead') {
    const sx = w * 0.17, sy = h * 0.82, tx = w * 0.42, ty = h * 0.3;
    const endX = w * 0.8;
    const p = stage === 0 ? 0 : stage === 1 ? (clipTime - 6) / 6 : stage === 2 ? 0 : Math.min(1, (clipTime - 18) / 5);
    ship(ctx, sx, sy, 0, '#72dfde');
    ship(ctx, tx + (endX - tx) * p, ty, Math.PI / 2, '#ff9e9e');
    line(ctx, tx, ty, endX, ty, '#ff9e9e', true);
    if (stage >= 1) line(ctx, sx, sy, tx, ty, '#ffc38b', true);
    if (stage >= 2) {line(ctx, sx, sy, endX, ty, '#72dfde'); ctx.strokeStyle = '#72dfde'; ctx.beginPath(); ctx.arc(endX, ty, 13, 0, Math.PI * 2); ctx.stroke();}
    if (stage === 1 || stage === 3) {
      // Both projectiles use the same speed. Direct aim reaches the old position
      // earlier and then continues; only the lead trajectory meets the moving ship.
      const speedRatio = Math.hypot(endX - sx, ty - sy) / Math.hypot(tx - sx, ty - sy);
      ctx.fillStyle = '#ffc38b'; ctx.beginPath(); ctx.arc(sx + (tx - sx) * p * speedRatio, sy + (ty - sy) * p * speedRatio, 4, 0, Math.PI * 2); ctx.fill();
      if (stage === 3) {ctx.fillStyle = '#72dfde'; ctx.beginPath(); ctx.arc(sx + (endX - sx) * p, sy + (ty - sy) * p, 4, 0, Math.PI * 2); ctx.fill();}
    }
    text(ctx, 'Zielkurs →', w * 0.42, ty - 30); text(ctx, stage >= 2 ? 'Vorhalt' : 'Aktuelle Position', w - 18, h - 20, 'right');
  } else if (kind === 'sensor') {
    const sx = w * 0.2, sy = h * 0.61, radius = Math.min(w * 0.28, h * 0.31), tx = stage === 3 ? sx + radius * 0.7 : w * 0.82;
    ctx.strokeStyle = '#72dfde'; ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.stroke();
    ship(ctx, sx, sy, Math.PI / 2, '#72dfde');
    if (stage === 0 || stage === 3) ship(ctx, tx, sy, -Math.PI / 2, '#ff9e9e', stage === 0);
    if (stage === 1) line(ctx, sx, sy, w - 18, sy, '#ffc38b', true);
    text(ctx, ['Lehransicht', 'Botansicht: ESM', 'Botansicht: kein Kontakt', 'Botansicht: Radar'][stage], 16, 55);
    text(ctx, '600 m', sx + radius * 0.3, sy + radius + 23);
  } else {
    const labels = ['Beobachtung → Actor', 'Absicht → Controller', 'Reward → Critic', 'PPO → neue Gewichte'];
    labels.forEach((label, i) => {
      const y = 60 + i * 52; ctx.fillStyle = stage === i ? '#294e60' : '#142f40'; ctx.fillRect(14, y - 23, w - 28, 40);
      text(ctx, (i + 1) + '   ' + label, 26, y + 3, 'left', stage === i ? '#72dfde' : '#acbfcc');
    });
  }
  if (stage !== lastStage) {$('clip-caption').textContent = CLIP_TEXT[kind][stage]; lastStage = stage;}
  $('clip-progress').value = String(Math.round(clipTime / CLIP_SECONDS * 1000));
}
function setPlaying(value) {
  clipPlaying = value; $('clip-play').textContent = value ? 'Pause' : 'Abspielen';
  cancelAnimationFrame(animationId);
  if (value) {lastFrame = performance.now(); animationId = requestAnimationFrame(frame);}
}
function frame(now) {
  if (!clipPlaying) return;
  clipTime = Math.min(CLIP_SECONDS, clipTime + Math.min((now - lastFrame) / 1000, 0.15)); lastFrame = now; drawClip();
  if (clipTime >= CLIP_SECONDS) setPlaying(false); else animationId = requestAnimationFrame(frame);
}

const QUIZZES = [
  ['Ist ein Bot mit Argmax-Auswahl automatisch untrainiert?', ['Ja, echte KI muss immer würfeln.', 'Nein: Lernen und deterministische Ausführung sind unterschiedliche Eigenschaften.'], 1, 'Die Gewichte können gelernt sein, obwohl gleiche Eingaben immer dieselbe Aktion erzeugen.'],
  ['Was liefert eine reine ESM-Peilung in unserem Bot-Snapshot?', ['Richtung und Kontaktkennung.', 'Entfernung, HP und Kurs.', 'Ein vollständiges Radarbild.'], 0, 'Präzise Zielinformationen fehlen. Das sendende Ziel kann entlang derselben Richtung unterschiedlich weit entfernt sein.'],
  ['Was bedeutet 90 % Softmax-Wahrscheinlichkeit für RETREAT?', ['90 % garantierte Überlebenschance.', 'Das Netz verteilt 90 % seiner Aktionsmasse auf RETREAT.', 'Der Controller muss immer fliehen.'], 1, 'Es ist eine Policy-Ausgabe, weder eine kalibrierte Erfolgschance noch ein Beleg für die endgültige Controlleraktion.'],
  ['Warum zählt ein Respawn-Teleport nicht als belohnte Annäherung?', ['Damit das Netz nicht den Positionssprung nach einer Versenkung als gutes Manöver bewertet.', 'Weil Teleports unsichtbar sind.'], 0, 'Der Sprung ist kein vom Schiff ausgeführter Anlauf. Belohnung dafür würde eine unerwünschte Abkürzung schaffen.'],
  ['Wofür dient der Critic?', ['Er gibt die richtige Aktion vor.', 'Er schätzt zukünftigen Return und hilft, Vorteile zu bestimmen.', 'Er zielt die Raketen.'], 1, 'Der Critic ist selbst ein gelerntes Schätzmodell. Seine Fehler sind Teil der Trainingsherausforderung.'],
  ['Nach besserer Abfangrechnung treffen dieselben Gewichte häufiger. Was ist belegt?', ['Das Netz hat selbst neues Vorhalten gelernt.', 'Die Ausführung der Absichten wurde verbessert.'], 1, 'Unveränderte Gewichte können durch einen besseren Planer deutlich wirksamer werden.'],
  ['Warum genügt Python-/TypeScript-Parität nicht als Qualitätstest?', ['Weil beide denselben schwachen Bot exakt ausführen können.', 'Weil Mathematik nichts mit Spielen zu tun hat.'], 0, 'Parität prüft die Übereinstimmung der Implementierungen. Spielstärke braucht getrennte Leistungsdaten.'],
  ['Welche Versuchsanordnung prüft eine Änderung am saubersten?', ['Neue Rewards, neue Gegner und doppelt so viel Training gleichzeitig.', 'Eine gezielte Änderung gegen einen Kontrolllauf mit gleichem Budget und mehreren Seeds.'], 1, 'So lassen sich Verbesserungen eher auf die untersuchte Änderung zurückführen.']
];
document.querySelectorAll('[data-quiz]').forEach(container => {
  const [question, answers, correct, explanation] = QUIZZES[Number(container.dataset.quiz)];
  const heading = document.createElement('strong'); heading.textContent = 'Selbsttest: ' + question; container.append(heading);
  const feedback = document.createElement('p'); feedback.className = 'feedback'; feedback.setAttribute('aria-live', 'polite');
  answers.forEach((answer, index) => {const button = document.createElement('button'); button.type = 'button'; button.textContent = answer;
    button.addEventListener('click', () => {feedback.textContent = (index === correct ? 'Richtig. ' : 'Noch nicht. ') + explanation;}); container.append(button);});
  container.append(feedback);
});

function renderEvaluation() {
  const names = {aggressive: 'Aggressiv', cautious: 'Vorsichtig', objective: 'Auftrag'};
  const table = document.createElement('table'), tr = table.insertRow();
  for (const name of ['Profil', 'Siege', 'Score Ø', 'Tode Ø', 'Zone', 'Radar an']) {const th = document.createElement('th'); th.textContent = name; tr.append(th);}
  Object.entries(MODELS).forEach(([profile, {evaluation: e}]) => {
    const row = table.insertRow();
    [names[profile], `${e.wins}/${e.episodes}`, fmt(e.mean_selfScore, 1), fmt(e.mean_deaths, 2), fmt(e.zoneSeconds_fraction * 100, 1) + ' %', fmt(e.radarSeconds_fraction * 100, 1) + ' %'].forEach(value => row.insertCell().textContent = value);
  });
  $('evaluation-table').append(table);
}

MODELS.aggressive.policy.actions.forEach((action, i) => {const option = document.createElement('option'); option.value = action; option.textContent = ACTION_LABELS[i]; $('model-previous').append(option);});
$('model-previous').value = 'SEEK_SEA_CONTROL';
for (const id of ['model-profile', 'model-scene', 'model-hp', 'model-target', 'model-previous']) $(id).addEventListener('input', updateModel);
for (const id of ['sensor-distance', 'sensor-class', 'own-radar', 'target-radar', 'teacher-view']) $(id).addEventListener('input', drawSensor);
for (const id of ['reward-zone', 'reward-rear']) $(id).addEventListener('input', updateReward);
for (const id of ['ppo-prob', 'ppo-adv']) $(id).addEventListener('input', updatePpo);
$('clip-play').addEventListener('click', () => {if (clipTime >= CLIP_SECONDS) clipTime = 0; setPlaying(!clipPlaying);});
$('clip-step').addEventListener('click', () => {setPlaying(false); clipTime = Math.min(23.9, (Math.floor(clipTime / 6) + 1) * 6); drawClip();});
$('clip-reset').addEventListener('click', () => {setPlaying(false); clipTime = 0; lastStage = -1; drawClip();});
$('clip-select').addEventListener('change', () => {setPlaying(false); clipTime = 0; lastStage = -1; drawClip();});
$('clip-progress').addEventListener('input', () => {setPlaying(false); clipTime = Number($('clip-progress').value) / 1000 * CLIP_SECONDS; drawClip();});
document.addEventListener('visibilitychange', () => {if (document.hidden) setPlaying(false);});
$('print-course').addEventListener('click', () => window.print());
let printDetails = [];
window.addEventListener('beforeprint', () => {
  printDetails = [...document.querySelectorAll('details')].filter(d => !d.open);
  printDetails.forEach(d => d.open = true);
});
window.addEventListener('afterprint', () => {printDetails.forEach(d => d.open = false);});
const checkboxes = [...document.querySelectorAll('[data-done]')];
try {const saved = JSON.parse(localStorage.getItem('bfa-academy-v1') || '[]'); if (Array.isArray(saved)) checkboxes.forEach(c => c.checked = saved.includes(c.dataset.done));} catch { /* local storage is optional */ }
function progress(save) {
  const done = checkboxes.filter(c => c.checked).map(c => c.dataset.done);
  $('progress').textContent = `Fortschritt: ${done.length} von 8 Lektionen markiert.`;
  if (save) try {localStorage.setItem('bfa-academy-v1', JSON.stringify(done));} catch { /* offline file browsers may block persistence */ }
}
checkboxes.forEach(c => c.addEventListener('change', () => progress(true)));
new ResizeObserver(() => {drawSensor(); drawClip();}).observe($('sensor-canvas'));
new ResizeObserver(drawClip).observe($('clip-canvas'));
updateModel(); updateReward(); updatePpo(); drawSensor(); drawClip(); renderEvaluation(); progress(false);

// Read-only exports for independent checks of this educational implementation.
window.academy = {forward, makeObservation, rewardExample, ppoExample, sensorState};
