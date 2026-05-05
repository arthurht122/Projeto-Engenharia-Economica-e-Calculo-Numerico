// ReinvestK - Landing Page Logic
// Espelha as funcoes e formulas do EngenhariaEcoCalcNum.ipynb

const state = {
  cadastrado: false,
  ultimoCalculo: null,
  ultimoFluxo: null,
  planoAtivo: null, // 'plus' | 'enterprise'
  simulacoesRestantes: 3,
};

const fmtBRL = (n) =>
  (isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtPct = (n) => `${(isFinite(n) ? n : 0).toFixed(2)}%`;
const fmtNum = (n, d = 2) => (isFinite(n) ? n : 0).toFixed(d);

document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   FUNCOES MATEMATICAS (mesmo do notebook)
   ============================================================ */

// def juroscompostos(i,n): return (i+1)**n - 1
const juroscompostos = (i, n) => Math.pow(1 + i, n) - 1;
// def jurossimples(i,n): return i*n
const jurossimples = (i, n) => i * n;

// K = (1+i)^n - (n*i + 1)  (Kc puro = compostos extra sobre simples)
const kPuro = (i, n) => Math.pow(1 + i, n) - (n * i + 1);

// Newton-Raphson: f(n) = (1+i)^n - n*i - 1 - kAlvo  ;  f'(n) = (1+i)^n*ln(1+i) - i
function periodoParaK(i, kAlvo, n0 = 2) {
  if (kAlvo <= 0) return 0;
  let n = n0;
  for (let it = 0; it < 200; it++) {
    const f = kPuro(i, n) - kAlvo;
    const df = Math.pow(1 + i, n) * Math.log(1 + i) - i;
    if (Math.abs(df) < 1e-12) break;
    const nNext = n - f / df;
    if (!isFinite(nNext)) break;
    if (Math.abs(nNext - n) < 1e-7) { n = nNext; break; }
    n = Math.max(1e-4, nNext);
  }
  return n;
}

// PRA(n) = (Kc% / qtde_anos) + (juros simples anualizado %)
//        onde qtde_anos = n*c/12, JS anual % = i*100*(12/c)
function PRA(i, n, contratoMes) {
  const k = kPuro(i, n);
  const c = contratoMes;
  const anos = (n * c) / 12;
  if (anos <= 0) return i * 100 * (12 / c);
  return (k * 100) / anos + i * 100 * (12 / c);
}

function dPRA_dn(i, n, contratoMes) {
  const c = contratoMes;
  const g = Math.pow(1 + i, n) - n * i - 1;
  const dg = Math.pow(1 + i, n) * Math.log(1 + i) - i;
  const h = (n * c) / 12;
  const dh = c / 12;
  if (h === 0) return 0;
  return ((dg * h - g * dh) / (h * h)) * 100;
}

function periodoParaTMA(i, tmaPct, contratoMes, n0 = 4) {
  let n = n0;
  for (let it = 0; it < 200; it++) {
    const f = PRA(i, n, contratoMes) - tmaPct;
    const df = dPRA_dn(i, n, contratoMes);
    if (Math.abs(df) < 1e-12) break;
    const nNext = n - f / df;
    if (!isFinite(nNext)) break;
    if (Math.abs(nNext - n) < 1e-6) { n = nNext; break; }
    n = Math.max(0.5, nNext);
  }
  return n;
}

/* ============================================================
   CALCULO PRINCIPAL E FLUXO DE CAIXA (igual ao notebook)
   ============================================================ */
function calcularMetricas({ vp, iPct, contratoMes, ntotMes, tmaPct, kAlvoPct }) {
  const i = iPct / 100;
  const n = ntotMes / contratoMes; // periodo efetivo

  // mesmo do notebook:
  let kc = juroscompostos(i, n);
  const ks = jurossimples(i, n);
  kc = kc - ks; // composto puro
  const kTotal = kc + ks;

  const valorJurosSimples = vp * ks;
  const valorJurosCompostos = vp * kc;
  const lucroVpK = vp * kTotal;
  const resgateTotal = vp + lucroVpK;

  const periodoKAlvo = (kAlvoPct || 0) > 0 ? periodoParaK(i, kAlvoPct / 100) : null;
  const periodoTMA = periodoParaTMA(i, tmaPct, contratoMes);
  const rendAnual = (n > 0)
    ? (kc * 100) / (n * contratoMes / 12) + i * 100 * (12 / contratoMes)
    : i * 100 * (12 / contratoMes);

  return {
    vp, iPct, i, n, ntotMes, contratoMes, tmaPct, kAlvoPct,
    kcPct: kc * 100,
    ksPct: ks * 100,
    kTotalPct: kTotal * 100,
    valorJurosSimples, valorJurosCompostos,
    lucroVpK, resgateTotal,
    periodoKAlvo, periodoTMA, rendAnual,
  };
}

// Reproduz a logica do `while (n_periodo <= qtde_fluxo)` do notebook
function gerarFluxo({ vp, i, contratoMes, qtdeFluxoMeses }) {
  const qtdeFluxo = Math.floor(qtdeFluxoMeses / contratoMes);
  const periodo_efe = [];
  const valor_acumulado = []; // = "Lucro Total" no CSV (k_total * vp)
  const juros_simples = [];   // = ks * vp
  const juros_compostos = []; // = kc_puro * vp (com t==1 -> 0)
  const retorno_anual = [];

  for (let t = 0; t <= qtdeFluxo; t++) {
    const kc = juroscompostos(i, t);
    const ks = jurossimples(i, t);
    const kc_puro = kc - ks;
    const k_total = kc_puro + ks; // == kc

    periodo_efe.push(t);
    valor_acumulado.push(k_total * vp);
    juros_simples.push(ks * vp);
    juros_compostos.push(t === 1 ? 0 : kc_puro * vp);

    if (t > 0) {
      retorno_anual.push((kc / (t/contratoMes)) * 100);
    } else {
      retorno_anual.push(0);
    }
  }

  // participacao_compostos
  const participacao = periodo_efe.map((_, j) => {
    const soma = juros_simples[j] + juros_compostos[j];
    return soma > 0 ? (juros_compostos[j] / soma) * 100 : 0;
  });

  return { periodo_efe, valor_acumulado, juros_simples, juros_compostos, retorno_anual, participacao, vp };
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

function lerInputs() {
  return {
    vp: parseFloat(document.getElementById('vp').value) || 0,
    iPct: parseFloat(document.getElementById('i').value) || 0,
    contratoMes: parseFloat(document.getElementById('contrato').value) || 3,
    ntotMes: parseFloat(document.getElementById('ntot').value) || 0,
    tmaPct: parseFloat(document.getElementById('tma').value) || 0,
    fluxoMes: parseFloat(document.getElementById('fluxo').value) || 0,
  };
}

formK.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.cadastrado) {
    alert('Faça o cadastro acima para liberar o cálculo gratuito.');
    document.getElementById('cadastro').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const v = lerInputs();
  if (v.vp <= 0 || v.iPct <= 0 || v.ntotMes <= 0 || v.contratoMes <= 0) {
    alert('Preencha capital, taxa, contrato e período investido com valores positivos.');
    return;
  }
  const r = calcularMetricas({ ...v, kAlvoPct: 0 });
  state.ultimoCalculo = r;
  state.ultimoFluxo = gerarFluxo({
    vp: v.vp, i: v.iPct / 100, contratoMes: v.contratoMes,
    qtdeFluxoMeses: v.fluxoMes > 0 ? v.fluxoMes : v.ntotMes,
  });

  document.getElementById('out-k').textContent = fmtPct(r.kcPct);
  document.getElementById('out-total-pct').textContent = fmtPct(r.kTotalPct);
  document.getElementById('out-acumulado').textContent = fmtBRL(r.resgateTotal);
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
const abrirModal = () => { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); };
const fecharModal = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); };
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
    alert('Verifique os dados do cartão.'); return;
  }
  state.planoAtivo = planoSelecionado;
  fecharModal();
  liberarResultado();
});

/* ============================================================
   5. LIBERACAO
   ============================================================ */
function liberarResultado() {
  const sec = document.getElementById('liberacao');
  sec.classList.remove('hidden');

  if (!state.ultimoCalculo) {
    state.ultimoCalculo = calcularMetricas({
      vp: 10000, iPct: 2.5, contratoMes: 3, ntotMes: 36, tmaPct: 12, kAlvoPct: 5,
    });
    state.ultimoFluxo = gerarFluxo({ vp: 10000, i: 0.025, contratoMes: 3, qtdeFluxoMeses: 36 });
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
    requestAnimationFrame(() => desenharTodosGraficos(state.ultimoFluxo, r));
  }
  sec.scrollIntoView({ behavior: 'smooth' });
}

function preencherMetricas(r) {
  const kAlvoPct = parseFloat(document.getElementById('kalvo')?.value) || 0;
  const periodoK = kAlvoPct > 0 ? periodoParaK(r.i, kAlvoPct / 100) : null;

  document.getElementById('lib-nef').textContent = fmtNum(r.n, 2);
  document.getElementById('lib-k').textContent = fmtPct(r.kcPct);
  document.getElementById('lib-ks-pct').textContent = fmtPct(r.ksPct);
  document.getElementById('lib-jt-pct').textContent = fmtPct(r.kTotalPct);
  document.getElementById('lib-periodo-k').textContent =
    periodoK !== null ? `${fmtNum(periodoK, 2)} períodos (K=${fmtPct(kAlvoPct)})` : '— informe K alvo';
  document.getElementById('lib-periodo-tma').textContent =
    `${fmtNum(r.periodoTMA, 2)} períodos (TMA=${fmtPct(r.tmaPct)} a.a.)`;
  document.getElementById('lib-js-val').textContent = fmtBRL(r.valorJurosSimples);
  document.getElementById('lib-jc-val').textContent = fmtBRL(r.valorJurosCompostos);
  document.getElementById('lib-vpk').textContent = fmtBRL(r.lucroVpK);
  document.getElementById('lib-rend').textContent = fmtPct(r.rendAnual);
  document.getElementById('lib-acum').textContent = fmtBRL(r.resgateTotal);
}

document.getElementById('btn-recalc').addEventListener('click', () => {
  if (!state.ultimoCalculo) return;
  preencherMetricas(state.ultimoCalculo);
});

/* ============================================================
   GRAFICOS GRANDES (canvas customizado, empilhados)
   ============================================================ */
const COLORS = {
  azul:    '#5aa1ff',
  verde:   '#5dd39e',
  vermelho:'#ff7a8a',
  roxo:    '#c79bff',
  laranja: '#ffa94d',
  ouro:    '#d4af37',
  ouro2:   '#f1c95a',
  cinza:   '#b9b4a4',
};

function setupCanvas(id) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  // Suporte HiDPI
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, W: cssW, H: cssH };
}

function bbox(W, H, padL = 70, padR = 30, padT = 50, padB = 50) {
  return { padL, padR, padT, padB, plotW: W - padL - padR, plotH: H - padT - padB };
}

function drawGrid(ctx, b, W, H, minY, maxY, fmtY) {
  ctx.fillStyle = COLORS.cinza;
  ctx.font = '12px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let g = 0; g <= 5; g++) {
    const y = b.padT + (b.plotH * g) / 5;
    ctx.strokeStyle = 'rgba(212,175,55,0.08)';
    ctx.beginPath(); ctx.moveTo(b.padL, y); ctx.lineTo(W - b.padR, y); ctx.stroke();
    const v = maxY - ((maxY - minY) * g) / 5;
    ctx.fillText(fmtY(v), b.padL - 8, y);
  }
}

function drawXAxisLabels(ctx, b, W, H, periodos) {
  ctx.fillStyle = COLORS.cinza;
  ctx.font = '11px Inter, sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const n = periodos.length;
  const step = Math.max(1, Math.ceil(n / 12));
  for (let k = 0; k < n; k += step) {
    const x = b.padL + (b.plotW * k) / Math.max(1, n - 1);
    ctx.fillText(periodos[k], x, H - b.padB + 8);
  }
}

function drawAxes(ctx, b, W, H) {
  ctx.strokeStyle = 'rgba(212,175,55,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(b.padL, b.padT);
  ctx.lineTo(b.padL, H - b.padB);
  ctx.lineTo(W - b.padR, H - b.padB);
  ctx.stroke();
}

function drawTitle(ctx, b, text) {
  ctx.fillStyle = COLORS.cinza;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, b.padL, 8);
}

function drawLegend(ctx, b, W, items) {
  let x = b.padL;
  const y = 26;
  ctx.font = '12px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  items.forEach((it) => {
    if (it.kind === 'line') {
      ctx.strokeStyle = it.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 22, y); ctx.stroke();
      if (it.marker) drawMarker(ctx, x + 11, y, it.color, it.marker);
    } else if (it.kind === 'bar') {
      ctx.fillStyle = it.color; ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y - 7, 22, 14); ctx.globalAlpha = 1;
    } else if (it.kind === 'fill') {
      ctx.fillStyle = it.color; ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y - 7, 22, 14); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#f3f1ea';
    ctx.textAlign = 'left';
    ctx.fillText(it.label, x + 30, y);
    x += 32 + ctx.measureText(it.label).width + 18;
  });
}

function drawMarker(ctx, x, y, color, type = 'circle') {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0e0e0e';
  ctx.lineWidth = 1.5;
  if (type === 'circle') {
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (type === 'square') {
    ctx.beginPath(); ctx.rect(x - 4, y - 4, 8, 8); ctx.fill(); ctx.stroke();
  } else if (type === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (type === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (type === 'star') {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 6 : 2.6;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function plotLine(ctx, b, W, H, xs, ys, minY, maxY, color, marker, dash = null, width = 2.5) {
  const xOf = (idx) => b.padL + (b.plotW * idx) / Math.max(1, xs.length - 1);
  const yOf = (v) => b.padT + b.plotH * (1 - (v - minY) / Math.max(1e-9, maxY - minY));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
  ctx.beginPath();
  xs.forEach((_, idx) => {
    const x = xOf(idx), y = yOf(ys[idx]);
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  if (marker) {
    xs.forEach((_, idx) => drawMarker(ctx, xOf(idx), yOf(ys[idx]), color, marker));
  }
}

function annotate(ctx, b, W, H, xs, ys, minY, maxY, fmt, skipFirst = true, dyOffset = -12) {
  const xOf = (idx) => b.padL + (b.plotW * idx) / Math.max(1, xs.length - 1);
  const yOf = (v) => b.padT + b.plotH * (1 - (v - minY) / Math.max(1e-9, maxY - minY));
  ctx.fillStyle = '#f3f1ea';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  xs.forEach((_, idx) => {
    if (skipFirst && idx === 0) return;
    ctx.fillText(fmt(ys[idx]), xOf(idx), yOf(ys[idx]) + dyOffset);
  });
}

function plotBars(ctx, b, W, H, periodos, seriesA, seriesB, minY, maxY, colorA, colorB) {
  const n = periodos.length;
  const groupW = b.plotW / Math.max(1, n);
  const barW = Math.min(18, groupW * 0.36);
  const yOf = (v) => b.padT + b.plotH * (1 - (v - minY) / Math.max(1e-9, maxY - minY));
  const y0 = yOf(0);
  for (let k = 0; k < n; k++) {
    const cx = b.padL + groupW * (k + 0.5);
    const yA = yOf(seriesA[k]);
    const yB = yOf(seriesB[k]);
    ctx.fillStyle = colorA; ctx.globalAlpha = 0.75;
    ctx.fillRect(cx - barW - 1, Math.min(yA, y0), barW, Math.abs(yA - y0));
    ctx.fillStyle = colorB;
    ctx.fillRect(cx + 1, Math.min(yB, y0), barW, Math.abs(yB - y0));
    ctx.globalAlpha = 1;
  }
}

function fillArea(ctx, b, W, H, xs, lower, upper, minY, maxY, color, alpha = 0.45) {
  const xOf = (idx) => b.padL + (b.plotW * idx) / Math.max(1, xs.length - 1);
  const yOf = (v) => b.padT + b.plotH * (1 - (v - minY) / Math.max(1e-9, maxY - minY));
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
  ctx.beginPath();
  xs.forEach((_, idx) => {
    const x = xOf(idx), y = yOf(upper[idx]);
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  for (let idx = xs.length - 1; idx >= 0; idx--) {
    ctx.lineTo(xOf(idx), yOf(lower[idx]));
  }
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}

/* ----- Os 5 graficos ----- */
function desenharTodosGraficos(fluxo, r) {
  const peri = fluxo.periodo_efe;
  const lucroTotal = fluxo.valor_acumulado;
  const js = fluxo.juros_simples;
  const jc = fluxo.juros_compostos;
  const retAnual = fluxo.retorno_anual;
  const part = fluxo.participacao;
  const vp = fluxo.vp;

  // 1. Evolucao do valor acumulado e componentes de juros (3 linhas)
  {
    const { ctx, W, H } = setupCanvas('chart-acum');
    const b = bbox(W, H, 80, 30, 56, 56);
    ctx.clearRect(0, 0, W, H);
    const allY = [...lucroTotal, ...js, ...jc];
    const maxY = Math.max(...allY) * 1.1;
    const minY = Math.min(0, Math.min(...allY));
    drawGrid(ctx, b, W, H, minY, maxY, (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR'));
    drawAxes(ctx, b, W, H);
    drawXAxisLabels(ctx, b, W, H, peri);
    drawTitle(ctx, b, `VP = ${fmtBRL(vp)}  |  i = ${r.iPct}% por contrato  |  contrato = ${r.contratoMes} meses  |  n efetivo = ${fmtNum(r.n, 2)}`);
    drawLegend(ctx, b, W, [
      { kind: 'line', color: COLORS.azul,    marker: 'circle',   label: 'Valor Acumulado (Lucro Total)' },
      { kind: 'line', color: COLORS.vermelho,marker: 'square',   label: 'Juros Simples Acum.' },
      { kind: 'line', color: COLORS.verde,   marker: 'triangle', label: 'Juros Compostos Acum.' },
    ]);
    plotLine(ctx, b, W, H, peri, lucroTotal, minY, maxY, COLORS.azul, 'circle', null, 2.8);
    plotLine(ctx, b, W, H, peri, js,         minY, maxY, COLORS.vermelho, 'square', [6, 4], 2.2);
    plotLine(ctx, b, W, H, peri, jc,         minY, maxY, COLORS.verde, 'triangle', [2, 4], 2.2);
  }

  // 2. Retorno anual equivalente (com anotacoes)
  {
    const { ctx, W, H } = setupCanvas('chart-anual');
    const b = bbox(W, H, 80, 30, 56, 56);
    ctx.clearRect(0, 0, W, H);
    const positivos = retAnual.slice(1);
    const maxY = Math.max(...positivos, 0) * 1.18;
    const minY = Math.min(0, Math.min(...positivos));
    drawGrid(ctx, b, W, H, minY, maxY, (v) => v.toFixed(1) + '%');
    drawAxes(ctx, b, W, H);
    drawXAxisLabels(ctx, b, W, H, peri);
    drawTitle(ctx, b, 'Retorno anual equivalente — anotado em cada período');
    drawLegend(ctx, b, W, [{ kind: 'line', color: COLORS.roxo, marker: 'diamond', label: 'Retorno Anual Eq. (%)' }]);
    plotLine(ctx, b, W, H, peri, retAnual, minY, maxY, COLORS.roxo, 'diamond', null, 3);
    annotate(ctx, b, W, H, peri, retAnual, minY, maxY, (v) => v.toFixed(1) + '%', true, -12);
  }

  // 3. Composicao dos juros por periodo (BAR CHART)
  {
    const { ctx, W, H } = setupCanvas('chart-comp');
    const b = bbox(W, H, 80, 30, 56, 56);
    ctx.clearRect(0, 0, W, H);
    const allY = [...js, ...jc, 0];
    const maxY = Math.max(...allY) * 1.12;
    const minY = Math.min(0, Math.min(...allY));
    drawGrid(ctx, b, W, H, minY, maxY, (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR'));
    drawAxes(ctx, b, W, H);
    drawXAxisLabels(ctx, b, W, H, peri);
    drawTitle(ctx, b, 'Composição dos juros por período (barras agrupadas)');
    drawLegend(ctx, b, W, [
      { kind: 'bar', color: COLORS.vermelho, label: 'Juros Simples' },
      { kind: 'bar', color: COLORS.verde,    label: 'Juros Compostos' },
    ]);
    plotBars(ctx, b, W, H, peri, js, jc, minY, maxY, COLORS.vermelho, COLORS.verde);
  }

  // 4. Participacao dos compostos (%) com linha em 50%
  {
    const { ctx, W, H } = setupCanvas('chart-part');
    const b = bbox(W, H, 80, 30, 56, 56);
    ctx.clearRect(0, 0, W, H);
    const maxY = Math.max(...part, 60) * 1.05;
    const minY = 0;
    drawGrid(ctx, b, W, H, minY, maxY, (v) => v.toFixed(0) + '%');
    drawAxes(ctx, b, W, H);
    drawXAxisLabels(ctx, b, W, H, peri);
    drawTitle(ctx, b, 'Participação dos juros compostos no total (com meta 50%)');
    drawLegend(ctx, b, W, [
      { kind: 'line', color: COLORS.laranja,  marker: 'star',   label: 'Participação (%)' },
      { kind: 'line', color: COLORS.vermelho, marker: null,     label: 'Meta 50%' },
    ]);
    // linha 50%
    const yOf = (v) => b.padT + b.plotH * (1 - (v - minY) / Math.max(1e-9, maxY - minY));
    ctx.strokeStyle = COLORS.vermelho; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.padL, yOf(50)); ctx.lineTo(W - b.padR, yOf(50)); ctx.stroke();
    ctx.setLineDash([]);
    plotLine(ctx, b, W, H, peri, part, minY, maxY, COLORS.laranja, 'star', null, 2.8);
    annotate(ctx, b, W, H, peri, part, minY, maxY, (v) => v.toFixed(1) + '%', true, -12);
  }

  // 5. Visao consolidada (eixo duplo + areas preenchidas)
  {
    const { ctx, W, H } = setupCanvas('chart-cons');
    const b = bbox(W, H, 90, 90, 56, 56);
    ctx.clearRect(0, 0, W, H);

    const retornoTotal = lucroTotal.map((j) => j + vp);
    const retornoTotalJS = js.map((j) => j + vp);
    const baseVP = lucroTotal.map(() => vp);

    const maxY1 = Math.max(...retornoTotal) * 1.08;
    const minY1 = Math.min(...baseVP) * 0.92;
    const maxY2 = Math.max(...retAnual, 1) * 1.15;
    const minY2 = Math.min(0, Math.min(...retAnual));

    // grid principal (R$)
    drawGrid(ctx, b, W, H, minY1, maxY1, (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR'));
    drawAxes(ctx, b, W, H);
    drawXAxisLabels(ctx, b, W, H, peri);
    drawTitle(ctx, b, `Visão consolidada — VP = ${fmtBRL(vp)} | i = ${r.iPct}% (contrato ${r.contratoMes} meses)`);

    // labels eixo direito (%)
    ctx.fillStyle = COLORS.roxo;
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let g = 0; g <= 5; g++) {
      const y = b.padT + (b.plotH * g) / 5;
      const v = maxY2 - ((maxY2 - minY2) * g) / 5;
      ctx.fillText(v.toFixed(1) + '%', W - b.padR + 8, y);
    }

    // areas: VP -> JS (verde), JS -> Total (laranja)
    fillArea(ctx, b, W, H, peri, baseVP,        retornoTotalJS, minY1, maxY1, COLORS.verde,   0.45);
    fillArea(ctx, b, W, H, peri, retornoTotalJS, retornoTotal,  minY1, maxY1, COLORS.laranja, 0.55);

    // linha valor acumulado (R$)
    plotLine(ctx, b, W, H, peri, retornoTotal, minY1, maxY1, COLORS.azul, 'circle', null, 3);

    // linha retorno anual (% no eixo da direita) — re-mapeio para o eixo Y2
    const yOf2 = (v) => b.padT + b.plotH * (1 - (v - minY2) / Math.max(1e-9, maxY2 - minY2));
    const xOf = (idx) => b.padL + (b.plotW * idx) / Math.max(1, peri.length - 1);
    ctx.strokeStyle = COLORS.roxo; ctx.lineWidth = 2.5;
    ctx.beginPath();
    peri.forEach((_, idx) => {
      const x = xOf(idx), y = yOf2(retAnual[idx]);
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    peri.forEach((_, idx) => drawMarker(ctx, xOf(idx), yOf2(retAnual[idx]), COLORS.roxo, 'square'));

    drawLegend(ctx, b, W, [
      { kind: 'line', color: COLORS.azul,    marker: 'circle', label: 'Valor Acumulado (R$)' },
      { kind: 'line', color: COLORS.roxo,    marker: 'square', label: 'Retorno Anual Eq. (%)' },
      { kind: 'fill', color: COLORS.verde,   label: 'Juros Simples (área)' },
      { kind: 'fill', color: COLORS.laranja, label: 'Juros Composto adicional (área)' },
    ]);
  }
}

/* ============================================================
   EXCEL (CSV) - Mesmas colunas do notebook
   ============================================================ */
document.getElementById('btn-excel').addEventListener('click', () => {
  const f = state.ultimoFluxo;
  const r = state.ultimoCalculo;
  if (!f || !r) return;

  // df = {'Periodo efetivo', 'Lucro Total', 'Lucro por Juros Simples',
  //       'Lucro por Juros Composto', 'Retorno total', 'Percentual de rendimento anual'}
  const sep = ';';
  const header = [
    'Periodo efetivo',
    'Lucro Total',
    'Lucro por Juros Simples',
    'Lucro por Juros Composto',
    'Retorno total',
    'Percentual de rendimento anual',
  ].join(sep);

  const rows = f.periodo_efe.map((t, idx) => [
    t,
    f.valor_acumulado[idx].toFixed(2),
    f.juros_simples[idx].toFixed(2),
    f.juros_compostos[idx].toFixed(2),
    (f.vp + f.valor_acumulado[idx]).toFixed(2),
    f.retorno_anual[idx].toFixed(4),
  ].join(sep));

  const csv = "﻿" + header + '\n' + rows.join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Dados_Investimento_Fluxo_de_caixa.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
