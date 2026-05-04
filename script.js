// Estado da aplicação
const state = {
    user: null,
    plan: null,
    price: null,
    simulationsUsed: 0,
    lastResults: null,
};

// ========== NAVEGAÇÃO ==========
function goTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

// ========== CADASTRO ==========
function handleRegister(event) {
    event.preventDefault();
    state.user = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
    };
    goTo('calculator');
}

// ========== CÁLCULO DE K (GRÁTIS) ==========
// Fórmula do projeto: K = (1+i)^n - (n*i + 1)
function calcularK() {
    const vp = parseFloat(document.getElementById('vp').value);
    const i = parseFloat(document.getElementById('i').value);
    const n = parseFloat(document.getElementById('n').value);

    if (!vp || !i || !n) {
        alert('Preencha todos os campos corretamente.');
        return;
    }

    const js = n * i + 1;
    const jc = Math.pow(1 + i, n);
    const K = jc - js;
    const lucroTotal = (n * i + K) * 100;
    const totalAcumulado = vp * K + n * i * vp + vp;
    const rendimentoAnual = (K * 100 / (n / 4)) + i * 4 * 100;

    document.getElementById('resultEmpty').style.display = 'none';
    document.getElementById('resultContent').style.display = 'block';

    document.getElementById('resK').textContent = (K * 100).toFixed(2) + '%';
    document.getElementById('resLucro').textContent = lucroTotal.toFixed(2) + '%';
    document.getElementById('resTotal').textContent = 'R$ ' + totalAcumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('resAnual').textContent = rendimentoAnual.toFixed(2) + '%';
}

// ========== PLANOS ==========
function selectPlan(plan, price) {
    state.plan = plan;
    state.price = price;
    document.getElementById('selectedPlan').textContent = plan === 'plus' ? 'Plus' : 'Enterprise';
    document.getElementById('selectedPrice').textContent = 'R$ ' + price.toLocaleString('pt-BR') + ',00 / mês';
    goTo('payment');
}

function confirmPayment() {
    state.simulationsUsed = 0;
    const userName = state.user ? state.user.name : 'Usuário';
    document.getElementById('dashUserName').textContent = userName;
    document.getElementById('dashPlanTag').textContent = state.plan === 'plus' ? 'PLUS' : 'ENTERPRISE';

    const isEnterprise = state.plan === 'enterprise';

    document.getElementById('chartsCard').classList.toggle('locked', !isEnterprise);
    document.getElementById('excelCard').classList.toggle('locked', !isEnterprise);

    if (state.plan === 'plus') {
        document.getElementById('dashSubtitle').textContent =
            'Plano Plus — 3 simulações por mês + métricas';
        updateUsageInfo();
    } else {
        document.getElementById('dashSubtitle').textContent =
            'Plano Enterprise — acesso ilimitado, métricas, gráficos e Excel';
        document.getElementById('usageInfo').textContent = 'Acesso ilimitado ✓';
    }

    goTo('dashboard');
}

function updateUsageInfo() {
    if (state.plan === 'plus') {
        const remaining = 3 - state.simulationsUsed;
        document.getElementById('usageInfo').textContent =
            `Simulações restantes este mês: ${remaining}/3`;
    }
}

// ========== CÁLCULO AVANÇADO (Newton-Raphson) ==========
function calcularAvancado() {
    if (state.plan === 'plus' && state.simulationsUsed >= 3) {
        alert('Você atingiu o limite de 3 simulações deste mês. Faça upgrade para Enterprise para acesso ilimitado.');
        return;
    }

    const vp = parseFloat(document.getElementById('advVp').value);
    const i = parseFloat(document.getElementById('advI').value);
    const k = parseFloat(document.getElementById('advK').value);
    const TMA = parseFloat(document.getElementById('advTMA').value) / 100;

    if (!vp || !i || !k || !TMA) {
        alert('Preencha todos os campos.');
        return;
    }

    // Newton-Raphson para período aproximado dado k
    const periodoK = newtonRaphsonK(i, k);

    // Newton-Raphson para período aproximado para atingir TMA
    const periodoTMA = newtonRaphsonTMA(i, TMA);

    // Rendimento anual
    const rendimentoAnual = (k * 100 / (periodoK / 4)) + i * 4 * 100;

    // Valor de resgate
    const jurosTotal = 1 + periodoK * i + k;
    const resgate = vp * jurosTotal;

    state.lastResults = {
        vp, i, k, TMA,
        periodoK, periodoTMA, rendimentoAnual, resgate
    };

    // Atualiza UI
    const r = document.getElementById('advResult');
    r.classList.add('show');
    r.innerHTML = `
        <strong>Resultados Newton-Raphson:</strong><br>
        Período (n) para k=${k}: <b>${periodoK.toFixed(4)}</b> trimestres<br>
        Período (n) para TMA=${(TMA * 100).toFixed(1)}%: <b>${periodoTMA.toFixed(4)}</b> trimestres<br>
        Valor de Resgate: <b>R$ ${resgate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
    `;

    // Atualiza métricas
    document.getElementById('metricPeriod').textContent = periodoK.toFixed(2) + ' tri';
    document.getElementById('metricTMA').textContent = periodoTMA.toFixed(2) + ' tri';
    document.getElementById('metricAnual').textContent = rendimentoAnual.toFixed(2) + '%';
    document.getElementById('metricResgate').textContent =
        'R$ ' + resgate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Conta uso (apenas Plus)
    if (state.plan === 'plus') {
        state.simulationsUsed++;
        updateUsageInfo();
    }
}

// f(n) = (1+i)^n - (n*i + 1) - k
// f'(n) = (1+i)^n * ln(1+i) - i
function newtonRaphsonK(i, k) {
    let n = 5;
    for (let j = 0; j < 50; j++) {
        const f = Math.pow(1 + i, n) - (n * i + 1) - k;
        const fl = Math.pow(1 + i, n) * Math.log(1 + i) - i;
        n = n - f / fl;
    }
    return n;
}

// f(n) = ((1+i)^n - (n*i+1))/(n/4) + 4*i - TMA
function newtonRaphsonTMA(i, TMA) {
    let n = 5;
    for (let j = 0; j < 50; j++) {
        const f = (Math.pow(1 + i, n) - (n * i + 1)) / (n / 4) + 4 * i - TMA;
        const num = 4 * (((Math.pow(1 + i, n) * Math.log(1 + i) - i) * n) - (Math.pow(1 + i, n) - (n * i + 1)));
        const fl = num / (n * n);
        n = n - f / fl;
    }
    return n;
}

// ========== GRÁFICO (Enterprise) ==========
function gerarGrafico() {
    if (state.plan !== 'enterprise') {
        alert('Recurso disponível apenas no plano Enterprise.');
        return;
    }
    if (!state.lastResults) {
        alert('Execute uma simulação primeiro.');
        return;
    }

    const { vp, i } = state.lastResults;
    const trimestres = 16;
    const valores = [];
    for (let n = 0; n < trimestres; n++) {
        const ks = n * i;
        const kc = Math.pow(1 + i, n) - (n * i + 1);
        valores.push(vp * (1 + ks + kc));
    }

    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const maxVal = Math.max(...valores);
    const minVal = Math.min(...valores);
    const padding = 40;

    // Eixos
    ctx.strokeStyle = '#cbd5e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, H - padding);
    ctx.lineTo(W - padding, H - padding);
    ctx.stroke();

    // Linha do gráfico
    ctx.strokeStyle = '#0a8754';
    ctx.lineWidth = 3;
    ctx.beginPath();
    valores.forEach((v, idx) => {
        const x = padding + (idx / (trimestres - 1)) * (W - 2 * padding);
        const y = H - padding - ((v - minVal) / (maxVal - minVal)) * (H - 2 * padding);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Pontos
    ctx.fillStyle = '#00d68f';
    valores.forEach((v, idx) => {
        const x = padding + (idx / (trimestres - 1)) * (W - 2 * padding);
        const y = H - padding - ((v - minVal) / (maxVal - minVal)) * (H - 2 * padding);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Labels
    ctx.fillStyle = '#4a5568';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Trimestres', W / 2, H - 8);
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Valor Acumulado (R$)', 0, 0);
    ctx.restore();

    // Título
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#1a2332';
    ctx.fillText('Evolução do Valor Acumulado', W / 2, 20);
}

// ========== EXPORTAÇÃO EXCEL/CSV (Enterprise) ==========
function exportarExcel() {
    if (state.plan !== 'enterprise') {
        alert('Recurso disponível apenas no plano Enterprise.');
        return;
    }
    if (!state.lastResults) {
        alert('Execute uma simulação primeiro.');
        return;
    }

    const { vp, i } = state.lastResults;
    let csv = 'Trimestre,Juros Simples (R$),Juros Compostos (R$),Valor Acumulado (R$),Rendimento Anual (%)\n';
    for (let n = 0; n <= 20; n++) {
        const ks = n * i;
        const kc = Math.pow(1 + i, n) - (n * i + 1);
        const total = vp * (1 + ks + kc);
        const rendAnual = n > 0 ? ((Math.pow(1 + i, n) - 1) / (n / 4)) * 100 : 0;
        csv += `${n},${(vp * ks).toFixed(2)},${(vp * kc).toFixed(2)},${total.toFixed(2)},${rendAnual.toFixed(2)}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'simulacao_reinvestpro.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ========== LOGOUT ==========
function logout() {
    state.user = null;
    state.plan = null;
    state.price = null;
    state.simulationsUsed = 0;
    state.lastResults = null;
    goTo('hero');
}
