// ReinvestK - Landing Page Logic
// Fluxo: Cadastro -> Teste grátis (cálculo de K) -> Planos -> Pagamento -> Liberação

const state = {
  cadastrado: false,
  ultimoCalculo: null,
  planoAtivo: null, // 'plus' | 'enterprise'
  simulacoesRestantes: 3,
};

const fmtBRL = (n) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtPct = (n) => `${n.toFixed(2)}%`;

document.getElementById('year').textContent = new Date().getFullYear();

/* ===== 1. Cadastro ===== */
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

/* ===== 2. Teste grátis: cálculo de K ===== */
const formK = document.getElementById('form-k');

function calcularK(iPct, n, vp) {
  const i = iPct / 100;
  const k = Math.pow(1 + i, n) - (n * i + 1); // K = (1+i)^n - (n*i + 1)
  const lucroTotalPct = (n * i + k) * 100;
  const totalAcumulado = vp + vp * (n * i) + vp * k;
  const jurosSimplesAcum = vp * n * i;
  const jurosCompostosExtra = vp * k;
  return {
    kPct: k * 100,
    lucroTotalPct,
    totalAcumulado,
    jurosSimplesAcum,
    jurosCompostosExtra,
    iPct, n, vp,
  };
}

formK.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.cadastrado) {
    alert('Faça o cadastro acima para liberar o cálculo gratuito.');
    document.getElementById('cadastro').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const vp = parseFloat(document.getElementById('vp').value) || 0;
  const iPct = parseFloat(document.getElementById('i').value) || 0;
  const n = parseInt(document.getElementById('n').value, 10) || 0;

  if (vp <= 0 || iPct <= 0 || n <= 0) {
    alert('Preencha capital, taxa e períodos com valores positivos.');
    return;
  }

  const r = calcularK(iPct, n, vp);
  state.ultimoCalculo = r;

  document.getElementById('out-k').textContent = fmtPct(r.kPct);
  document.getElementById('out-total-pct').textContent = fmtPct(r.lucroTotalPct);
  document.getElementById('out-acumulado').textContent = fmtBRL(r.totalAcumulado);
});

/* ===== 3. Planos -> abrir modal de pagamento ===== */
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

function abrirModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function fecharModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', fecharModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });

/* ===== 4. Pagamento ===== */
const formPg = document.getElementById('form-pagamento');

// Máscaras simples
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

  // Simulação de cobrança
  state.planoAtivo = planoSelecionado;
  fecharModal();
  liberarResultado();
});

/* ===== 5. Liberação do resultado ===== */
function liberarResultado() {
  const sec = document.getElementById('liberacao');
  sec.classList.remove('hidden');

  if (!state.ultimoCalculo) {
    // sem cálculo prévio: usa default
    state.ultimoCalculo = calcularK(2.5, 12, 10000);
  }
  const r = state.ultimoCalculo;

  document.getElementById('lib-plano-info').innerHTML =
    `Plano <strong class="gold">${state.planoAtivo === 'plus' ? 'Plus' : 'Enterprise'}</strong> ativo. Resultado completo liberado.`;

  document.getElementById('lib-k').textContent = fmtPct(r.kPct);
  document.getElementById('lib-js').textContent = fmtBRL(r.jurosSimplesAcum);
  document.getElementById('lib-jc').textContent = fmtBRL(r.jurosCompostosExtra);
  document.getElementById('lib-total').textContent =
    `${fmtPct(r.lucroTotalPct)} · ${fmtBRL(r.jurosSimplesAcum + r.jurosCompostosExtra)}`;
  document.getElementById('lib-acum').textContent = fmtBRL(r.totalAcumulado);

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
    desenharGrafico(r);
  }

  sec.scrollIntoView({ behavior: 'smooth' });
}

/* ===== Gráfico (Enterprise) ===== */
function desenharGrafico(r) {
  const canvas = document.getElementById('lib-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const i = r.iPct / 100;
  const n = r.n;
  const pts = [];
  for (let t = 0; t <= n; t++) {
    const simples = r.vp * (1 + i * t);
    const composto = r.vp * Math.pow(1 + i, t);
    pts.push({ t, simples, composto });
  }
  const maxY = Math.max(...pts.map((p) => p.composto));
  const padL = 50, padR = 12, padT = 16, padB = 28;
  const w = W - padL - padR, h = H - padT - padB;

  // Eixos
  ctx.strokeStyle = 'rgba(212,175,55,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + h); ctx.lineTo(padL + w, padT + h);
  ctx.stroke();

  // Grid
  ctx.fillStyle = '#b9b4a4';
  ctx.font = '10px Inter, sans-serif';
  for (let g = 0; g <= 4; g++) {
    const y = padT + (h * g) / 4;
    ctx.strokeStyle = 'rgba(212,175,55,0.08)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
    const val = maxY * (1 - g / 4);
    ctx.fillText(Math.round(val).toLocaleString('pt-BR'), 4, y + 3);
  }

  const xOf = (t) => padL + (w * t) / n;
  const yOf = (v) => padT + h - (h * v) / maxY;

  // Linha juros simples
  ctx.strokeStyle = '#b9b4a4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(p.t), y = yOf(p.simples);
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Linha juros compostos
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(p.t), y = yOf(p.composto);
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Legenda
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(padL + 6, padT + 6, 12, 3);
  ctx.fillStyle = '#f3f1ea';
  ctx.fillText('Compostos', padL + 22, padT + 11);
  ctx.fillStyle = '#b9b4a4';
  ctx.fillRect(padL + 100, padT + 6, 12, 3);
  ctx.fillStyle = '#f3f1ea';
  ctx.fillText('Simples', padL + 116, padT + 11);
}

/* ===== Excel (CSV) - Enterprise ===== */
document.getElementById('btn-excel').addEventListener('click', () => {
  const r = state.ultimoCalculo;
  if (!r) return;
  const i = r.iPct / 100;
  let csv = 'Periodo;Juros Simples;Juros Compostos;Diferenca (K)\n';
  for (let t = 0; t <= r.n; t++) {
    const simples = r.vp * (1 + i * t);
    const composto = r.vp * Math.pow(1 + i, t);
    csv += `${t};${simples.toFixed(2)};${composto.toFixed(2)};${(composto - simples).toFixed(2)}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reinvestk_simulacao_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
