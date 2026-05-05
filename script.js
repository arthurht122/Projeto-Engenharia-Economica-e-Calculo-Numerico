// ReinvestK - Landing Page Logic
// Implementa metricas e graficos do EngenhariaEcoCalcNum.ipynb

const state = {
  cadastrado: false,
  ultimoCalculo: null,
  planoAtivo: null, // 'plus' | 'enterprise'
  simulacoesRestantes: 3,
};

const fmtBRL = (n) =>
  (isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtPct = (n) => `${(isFinite(n) ? n : 0).toFixed(2)}%`;
const fmtNum = (n, d = 2) => (isFinite(n) ? n : 0).toFixed(d);

document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   FUNCOES MATEMATICAS (espelham o notebook)
   ============================================================ */

// K = (1+i)^n - (n*i + 1)
function calcK(i, n) {
  return Math.pow(1 + i, n) - (n * i + 1);
}

// Derivada de f(n) = (1+i)^n - (n*i + 1) - k em relacao a n
function dK_dn(i, n) {
  return Math.pow(1 + i, n) * Math.log(1 + i) - i;
}

// Newton-Raphson: encontra n tal que K(i,n) = kAlvo
function periodoParaK(i, kAlvo, n0 = 2) {
  if (kAlvo <= 0) return 0;
  let n = n0;
  for (let it = 0; it < 200; it++) {
    const f = calcK(i, n) - kAlvo;
    const df = dK_dn(i, n);
    if (Math.abs(df) < 1e-12) break;
    const nNext = n - f / df;
    if (!isFinite(nNext)) break;
    if (Math.abs(nNext - n) < 1e-7) { n = nNext; break; }
    n = Math.max(0.0001, nNext);
  }
  return n;
}

// Porcentagem de rendimento anual:
//   PRA = (Kc % / qtde_anos) + (juros simples anualizado %)
// onde qtde_anos = n * contratoMes / 12, juros simples anual = i*100*(12/contratoMes)
function rendimentoAnual(iPct, kPct, n, contratoMes) {
  const qtdeAnos = (n * contratoMes) / 12;
  if (qtdeAnos <= 0) return 0;
  const jurosSimplesAnual = iPct * (12 / contratoMes);
  return kPct / qtdeAnos + jurosSimplesAnual;
}

// Funcao usada para encontrar n tal que PRA(n) = TMA
function fPRA(i, n, contratoMes, tmaPct) {
  // tudo em %
  const k = calcK(i, n);
  const PRA = (k * 100) / ((n * contratoMes) / 12) + i * 100 * (12 / contratoMes);
  return PRA - tmaPct;
}

function dPRA_dn(i, n, contratoMes) {
  // d/dn [ ((1+i)^n - n*i - 1) / (n*c/12) ] * 100
  // Usando derivada de (g(n)/h(n)) com g = (1+i)^n - n*i - 1 ; h = n*c/12
  const c = contratoMes;
  const g = Math.pow(1 + i, n) - n * i - 1;
  const dg = Math.pow(1 + i, n) * Math.log(1 + i) - i;
  const h = (n * c) / 12;
  const dh = c / 12;
  if (h === 0) return 0;
  return ((dg * h - g * dh) / (h * h)) * 100;
}

// Newton-Raphson para encontrar n tal que PRA = TMA
function periodoParaTMA(i, tmaPct, contratoMes, n0 = 4) {
  let n = n0;
  for (let it = 0; it < 200; it++) {
    const f = fPRA(i, n, contratoMes, tmaPct);
    const df = dPRA_dn(i, n, contratoMes);
    if (Math.abs(df) < 1e-12) break;
    const nNext = n - f / df;
    if (!isFinite(nNext)) break;
    if (Math.abs(nNext - n) < 1e-6) { n = nNext; break; }
    n = Math.max(0.5, nNext);
  }
  return n;
}

// Calculo principal: retorna todas as metricas
function calcularMetricas({ vp, iPct, n, contratoMes, tmaPct, kAlvoPct }) {
  const i = iPct / 100;

  const kc = calcK(i, n);                // % composto extra (decimal)
  const ks = i * n;                      // % simples (decimal)
  const kTotal = kc + ks;                // % total (decimal)

  const valorJurosSimples = vp * ks;
  const valorJurosCompostos = vp * kc;
  const valorAcumuladoJS = valorJurosSimples;
  const valorAcumuladoJC = valorJurosCompostos;
  const valorAcumuladoTotal = vp + valorJurosSimples + valorJurosCompostos;

  const periodoKAlvo = periodoParaK(i, (kAlvoPct || 0) / 100);
  const periodoTMA = periodoParaTMA(i, tmaPct, contratoMes);
  const rendAnual = rendimentoAnual(iPct, kc * 100, n, contratoMes);

  return {
    vp, iPct, i, n, contratoMes, tmaPct, kAlvoPct,
    kcPct: kc * 100,
    ksPct: ks * 100,
    kTotalPct: kTotal * 100,
    valorJurosSimples, valorJurosCompostos,
    valorAcumuladoJS, valorAcumuladoJC, valorAcumuladoTotal,
    periodoKAlvo, periodoTMA, rendAnual,
  };
}

// Fluxo de caixa (mesma logica das listas do notebook)
function gerarFluxo(r) {
  const { vp, i, n, contratoMes } = r;
  const periodos = [];
  for (let t = 0; t <= n; t++) {
    const ks = i * t;
    const kc = Math.pow(1 + i, t) - 1 - ks; // composto extra
    const valorJS = vp * (1 + ks);
    const valorJC = vp * (1 + kc + ks);
    const jSimplesAcum = vp * ks;
    const jCompostosAcum = vp * kc;
    const totalJuros = jSimplesAcum + jCompostosAcum;
    const participacao = totalJuros > 0 ? (jCompostosAcum / totalJuros) * 100 : 0;
    const anos = (t * contratoMes) / 12;
    const retornoAnual = anos > 0
      ? (kc * 100) / anos + i * 100 * (12 / contratoMes)
      : i * 100 * (12 / contratoMes);
    periodos.push({
      t,
      valorAcumulado: valorJC,
      valorJS,
      jSimplesAcum,
      jCompostosAcum,
      retornoAnual,
      participacao,
    });
  }
  return periodos;
}

/* ============================================================
   1. CADASTRO
   ============================================================ */
const formCadastro = document.getElementById('form-cadastro');
const cadMsg = document.getElementById('cadastro-msg');

formCadastro.addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = document.getElementById('nome').value.trim();
  const email = document.getElementById('email').value.trim();
  const tel = document.getElementById('telefone').value.trim();

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const telOk = tel.replace(/\D/g, '').length >= 10;

  if (!nome || !emailOk || !telOk) {
    cadMsg.textContent = 'Verifique nome, e-mail e telefone.';
    cadMsg.className = 'form-hint err';
    return;
  }

  state.cadastrado = true;
  cadMsg.textContent = `Pronto, ${nome.split(' ')[0]}! Teste grátis liberado abaixo.`;
  cadMsg.className = 'form-hint ok';

  document.getElementById('resultado-k').classList.remove('locked');
  document.getElementById('teste').scrollIntoView({ behavior: 'smooth' });
});

/* ============================================================
   2. TESTE GRATIS
   ============================================================ */
const formK = document.getElementById('form-k');

formK.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.cadastrado) {
    alert('Faça o cadastro acima para liberar o cálculo gratuito.');
    document.getElementById('cadastro').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const vp = parseFloat(document.getElementById('vp').value) || 0;
  const iPct = parseFloat(document.getElementById('i').value) || 0;
  const n = parseFloat(document.getElementById('n').value) || 0;
  const contratoMes = parseFloat(document.getElementById('contrato').value) || 3;
  const tmaPct = parseFloat(document.getElementById('tma').value) || 0;

  if (vp <= 0 || iPct <= 0 || n <= 0) {
    alert('Preencha capital, taxa e períodos com valores positivos.');
    return;
  }

  const r = calcularMetricas({ vp, iPct, n, contratoMes, tmaPct, kAlvoPct: 0 });
  state.ultimoCalculo = r;

  document.getElementById('out-k').textContent = fmtPct(r.kcPct);
  document.getElementById('out-total-pct').textContent = fmtPct(r.kTotalPct);
  document.getElementById('out-acumulado').textContent = fmtBRL(r.valorAcumuladoTotal);
});

/* ============================================================
   3. PLANOS -> MODAL DE PAGAMENTO
   ============================================================ */
const modal = document.getElementById('modal-pagamento');
const pgPlano = document.getElementById('pg-plano');
const pgValor = document.getElementById('pg-valor');
let planoSelecionado = null;
let valorSelecionado = 0;

document.querySelectorAll('.plan button[data-plan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    planoSelecionado = btn.dataset.plan;
    valorSelecionado = parseFloat(btn.dataset.price);
    pgPlano.textContent = planoSelecionado === 'plus' ? 'Plus' : 'Enterprise';
    pgValor.textContent = fmtBRL(valorSelecionado) + '/mês';
    abrirModal();
  });
});

function abrirModal() { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
function fecharModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', fecharModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });

/* ============================================================
   4. PAGAMENTO
   ============================================================ */
const formPg = document.getElementById('form-pagamento');

document.getElementById('card-number').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
});
document.getElementById('card-exp').addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
  e.target.value = v;
});
document.getElementById('card-cvv').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

formPg.addEventListener('submit', (e) => {
  e.preventDefault();
  const num = document.getElementById('card-number').value.replace(/\s/g, '');
  const exp = document.getElementById('card-exp').value;
  const cvv = document.getElementById('card-cvv').value;
  const nome = document.getElementById('card-name').value.trim();

  if (!nome || num.length < 13 || !/^\d{2}\/\d{2}$/.test(exp) || cvv.length < 3) {
    alert('Verifique os dados do cartão.');
    return;
  }

  state.planoAtivo = planoSelecionado;
  fecharModal();
  liberarResultado();
});

/* ============================================================
   5. LIBERACAO DO RESULTADO
   ============================================================ */
function liberarResultado() {
  const sec = document.getElementById('liberacao');
  sec.classList.remove('hidden');

  if (!state.ultimoCalculo) {
    state.ultimoCalculo = calcularMetricas({
      vp: 10000, iPct: 2.5, n: 12, contratoMes: 3, tmaPct: 12, kAlvoPct: 5,
    });
  }
  const r = state.ultimoCalculo;
  preencherMetricas(r);

  document.getElementById('lib-plano-info').innerHTML =
    `Plano <strong class="gold">${state.planoAtivo === 'plus' ? 'Plus' : 'Enterprise'}</strong> ativo. Resultado completo liberado.`;

  const plusBox = document.getElementById('lib-plus-only');
  const entBox = document.getElementById('lib-enterprise-only');

  if (state.planoAtivo === 'plus') {
    plusBox.classList.remove('hidden');
    entBox.classList.add('hidden');
    state.simulacoesRestantes = Math.max(0, state.simulacoesRestantes - 1);
    document.getElementById('lib-restantes').textContent = state.simulacoesRestantes;
  } else {
    plusBox.classList.add('hidden');
    entBox.classList.remove('hidden');
    desenharTodosGraficos(r);
  }

  sec.scrollIntoView({ behavior: 'smooth' });
}

function preencherMetricas(r) {
  const kAlvoPct = parseFloat(document.getElementById('kalvo')?.value) || 0;
  const periodoK = kAlvoPct > 0 ? periodoParaK(r.i, kAlvoPct / 100) : r.periodoKAlvo;

  document.getElementById('lib-k').textContent = fmtPct(r.kcPct);
  document.getElementById('lib-periodo-k').textContent =
    kAlvoPct > 0 ? `${fmtNum(periodoK, 2)} períodos (K=${fmtPct(kAlvoPct)})` : '— informe K alvo';
  document.getElementById('lib-periodo-tma').textContent =
    `${fmtNum(r.periodoTMA, 2)} períodos (TMA=${fmtPct(r.tmaPct)} a.a.)`;
  document.getElementById('lib-js-pct').textContent = fmtPct(r.ksPct);
  document.getElementById('lib-jc-pct').textContent = fmtPct(r.kcPct);
  document.getElementById('lib-jt-pct').textContent = fmtPct(r.kTotalPct);
  document.getElementById('lib-js-val').textContent = fmtBRL(r.valorAcumuladoJS);
  document.getElementById('lib-jc-val').textContent = fmtBRL(r.valorAcumuladoJC);
  document.getElementById('lib-acum').textContent = fmtBRL(r.valorAcumuladoTotal);
}

document.getElementById('btn-recalc').addEventListener('click', () => {
  if (!state.ultimoCalculo) return;
  preencherMetricas(state.ultimoCalculo);
});

/* ============================================================
   GRAFICOS (Enterprise)
   ============================================================ */
function eixos(ctx, W, H, padL, padR, padT, padB) {
  ctx.strokeStyle = 'rgba(212,175,55,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();
}

function desenharLinha(ctx, pts, xOf, yOf, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(p.x), y = yOf(p.y);
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function desenharGrafico(canvasId, series, opts = {}) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const padL = 56, padR = 14, padT = 28, padB = 32;
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const allX = series[0].points.map((p) => p.x);
  let maxY = Math.max(...allY);
  let minY = Math.min(...allY, 0);
  const maxX = Math.max(...allX);
  if (maxY === minY) maxY = minY + 1;

  // Grid + labels Y
  ctx.fillStyle = '#b9b4a4';
  ctx.font = '10px Inter, sans-serif';
  for (let g = 0; g <= 4; g++) {
    const y = padT + ((H - padT - padB) * g) / 4;
    ctx.strokeStyle = 'rgba(212,175,55,0.08)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const val = maxY - ((maxY - minY) * g) / 4;
    const lbl = opts.fmtY ? opts.fmtY(val) : val.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    ctx.fillText(lbl, 4, y + 3);
  }

  // Eixo X labels
  ctx.fillStyle = '#b9b4a4';
  for (let g = 0; g <= 4; g++) {
    const x = padL + ((W - padL - padR) * g) / 4;
    const val = (maxX * g) / 4;
    ctx.fillText(`t=${val.toFixed(0)}`, x - 10, H - padB + 16);
  }

  eixos(ctx, W, H, padL, padR, padT, padB);

  const xOf = (x) => padL + ((W - padL - padR) * x) / (maxX || 1);
  const yOf = (y) => padT + (H - padT - padB) * (1 - (y - minY) / (maxY - minY));

  series.forEach((s) => desenharLinha(ctx, s.points, xOf, yOf, s.color, s.width || 2));

  // Legenda
  let lx = padL + 6;
  series.forEach((s) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, padT - 16, 12, 3);
    ctx.fillStyle = '#f3f1ea';
    ctx.fillText(s.label, lx + 16, padT - 12);
    lx += 16 + ctx.measureText(s.label).width + 18;
  });
}

function desenharTodosGraficos(r) {
  const fluxo = gerarFluxo(r);

  // 1. Evolucao do valor acumulado
  desenharGrafico('chart-acum', [
    { label: 'Acumulado total', color: '#d4af37', width: 2.5,
      points: fluxo.map((p) => ({ x: p.t, y: p.valorAcumulado })) },
    { label: 'Apenas JS', color: '#b9b4a4', width: 2,
      points: fluxo.map((p) => ({ x: p.t, y: p.valorJS })) },
  ], { fmtY: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) });

  // 2. Juros simples vs compostos acumulados
  desenharGrafico('chart-juros', [
    { label: 'JS acumulado', color: '#b9b4a4', width: 2,
      points: fluxo.map((p) => ({ x: p.t, y: p.jSimplesAcum })) },
    { label: 'JC acumulado', color: '#d4af37', width: 2.5,
      points: fluxo.map((p) => ({ x: p.t, y: p.jCompostosAcum })) },
  ], { fmtY: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) });

  // 3. Retorno anual (%)
  desenharGrafico('chart-anual', [
    { label: 'Retorno anual %', color: '#f1c95a', width: 2.5,
      points: fluxo.map((p) => ({ x: p.t, y: p.retornoAnual })) },
  ], { fmtY: (v) => `${v.toFixed(1)}%` });

  // 4. Participacao dos compostos (%)
  desenharGrafico('chart-part', [
    { label: '% Compostos', color: '#d4af37', width: 2.5,
      points: fluxo.map((p) => ({ x: p.t, y: p.participacao })) },
  ], { fmtY: (v) => `${v.toFixed(1)}%` });
}

/* ============================================================
   EXCEL (CSV) - Enterprise
   ============================================================ */
document.getElementById('btn-excel').addEventListener('click', () => {
  const r = state.ultimoCalculo;
  if (!r) return;
  const fluxo = gerarFluxo(r);
  let csv = 'Periodo;Valor Acumulado;Valor (Juros Simples);Juros Simples Acumulado;Juros Compostos Acumulado;Retorno Anual (%);Participacao Compostos (%)\n';
  fluxo.forEach((p) => {
    csv += [
      p.t,
      p.valorAcumulado.toFixed(2),
      p.valorJS.toFixed(2),
      p.jSimplesAcum.toFixed(2),
      p.jCompostosAcum.toFixed(2),
      p.retornoAnual.toFixed(4),
      p.participacao.toFixed(4),
    ].join(';') + '\n';
  });
  const blob = new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reinvestk_fluxo_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
