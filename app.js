// Estado global da jornada
const state = {
  cadastro: null,
  calculo: null,
  resultado: null,
  plano: null,
};

const PLANOS = {
  plus: { nome: "Plus", preco: 100, simulacoes: 3, excel: false, graficos: false },
  enterprise: { nome: "Enterprise", preco: 1500, simulacoes: Infinity, excel: true, graficos: true },
};

// --- Navegação entre etapas ---
function goToStep(n) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`panel-${n}`).classList.add("active");

  document.querySelectorAll(".step").forEach((s) => {
    const step = Number(s.dataset.step);
    s.classList.remove("active", "done");
    if (step < n) s.classList.add("done");
    if (step === n) s.classList.add("active");
  });

  document.getElementById("produto").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => goToStep(Number(btn.dataset.go)));
});

// --- 1. Cadastro ---
document.getElementById("form-cadastro").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  state.cadastro = data;
  goToStep(2);
});

// --- 2. Cálculo de k (juros simples vs compostos) ---
function calculaK(i, n) {
  // k = (1 + i)^n - (n*i + 1)
  return Math.pow(1 + i, n) - (n * i + 1);
}

function fmtBRL(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v) {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

document.getElementById("form-calculo").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const vp = parseFloat(f.get("vp"));
  const i = parseFloat(f.get("i")) / 100;
  const n = parseFloat(f.get("n"));

  const k = calculaK(i, n);
  const totalRendimento = n * i + k;
  const valorAcumulado = vp * (1 + totalRendimento);
  const rendimentoAnual = (k * 100) / (n / 4) + i * 4 * 100;

  state.calculo = { vp, i, n };
  state.resultado = { k, totalRendimento, valorAcumulado, rendimentoAnual };

  document.getElementById("r-k").textContent = fmtPct(k);
  document.getElementById("r-total").textContent = fmtPct(totalRendimento);
  document.getElementById("r-acum").textContent = fmtBRL(valorAcumulado);
  document.getElementById("r-anual").textContent = `${rendimentoAnual.toFixed(2)}%`;

  document.getElementById("resultado-k").classList.remove("hidden");
  document.getElementById("acoes-calculo").classList.remove("hidden");
});

// --- 3. Planos ---
document.querySelectorAll("[data-plan]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.plan;
    state.plano = PLANOS[key];
    document.getElementById("resumo-plano").textContent = state.plano.nome;
    document.getElementById("resumo-valor").textContent = fmtBRL(state.plano.preco);
    goToStep(4);
  });
});

// --- 4. Pagamento ---
document.getElementById("form-pagamento").addEventListener("submit", (e) => {
  e.preventDefault();
  // Pagamento simulado: avança para entrega.
  renderEntrega();
  goToStep(5);
});

// --- 5. Entrega: métricas + arquivos conforme plano ---
function fluxoCaixa(vp, i, n) {
  // Gera vetor de valor acumulado por trimestre considerando juros compostos
  const linhas = [];
  for (let t = 0; t <= n; t++) {
    const acumulado = vp * Math.pow(1 + i, t);
    const simples = vp * (1 + i * t);
    linhas.push({ t, acumulado, simples, ganhoComposto: acumulado - simples });
  }
  return linhas;
}

function csvFluxoCaixa(linhas) {
  const header = "Trimestre;Valor Acumulado (Composto);Valor Simples;Ganho Extra (Composto)";
  const rows = linhas.map(
    (l) =>
      `${l.t};${l.acumulado.toFixed(2)};${l.simples.toFixed(2)};${l.ganhoComposto.toFixed(2)}`
  );
  return [header, ...rows].join("\n");
}

function downloadFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderEntrega() {
  const m = document.getElementById("entrega-metricas");
  const { vp, i, n } = state.calculo;
  const { k, totalRendimento, valorAcumulado, rendimentoAnual } = state.resultado;
  const linhas = fluxoCaixa(vp, i, n);
  const ganhoExtra = valorAcumulado - vp * (1 + i * n);

  const isEnterprise = state.plano.excel;
  const metricas = [
    { label: "Valor investido", valor: fmtBRL(vp) },
    { label: "Lucro extra (k)", valor: fmtPct(k), highlight: true },
    { label: "Rendimento total", valor: fmtPct(totalRendimento) },
    { label: "Valor acumulado", valor: fmtBRL(valorAcumulado) },
    { label: "Ganho extra (R$)", valor: fmtBRL(ganhoExtra), highlight: true },
    { label: "Rendimento anual", valor: `${rendimentoAnual.toFixed(2)}%` },
  ];

  m.innerHTML = metricas
    .map(
      (x) => `
        <div class="result-card ${x.highlight ? "highlight" : ""}">
          <span class="result-label">${x.label}</span>
          <strong>${x.valor}</strong>
        </div>`
    )
    .join("");

  // Arquivos disponíveis conforme plano
  const arquivos = [
    {
      nome: "Relatório de métricas (PDF)",
      meta: "Resumo do cálculo de k e rendimentos",
      disponivel: true,
      action: () => {
        const txt = metricas.map((x) => `${x.label}: ${x.valor}`).join("\n");
        downloadFile("relatorio-metricas.txt", `RELATÓRIO ReinvestK\n\n${txt}\n`, "text/plain");
      },
    },
    {
      nome: "Fluxo de caixa (CSV)",
      meta: "Tabela trimestral de valor acumulado",
      disponivel: true,
      action: () => downloadFile("fluxo-caixa.csv", csvFluxoCaixa(linhas), "text/csv"),
    },
    {
      nome: "Gráfico de evolução (SVG)",
      meta: isEnterprise ? "Plano Enterprise" : "Disponível apenas no Enterprise",
      disponivel: isEnterprise,
      action: () => downloadFile("grafico.svg", graficoSVG(linhas), "image/svg+xml"),
    },
    {
      nome: "Planilha completa (Excel)",
      meta: isEnterprise ? "Plano Enterprise" : "Disponível apenas no Enterprise",
      disponivel: isEnterprise,
      action: () => downloadFile("simulacao.xls", csvFluxoCaixa(linhas), "application/vnd.ms-excel"),
    },
  ];

  const ul = document.getElementById("entrega-arquivos");
  ul.innerHTML = "";
  arquivos.forEach((arq) => {
    const li = document.createElement("li");
    if (!arq.disponivel) li.classList.add("locked");
    li.innerHTML = `
      <div>
        <div>${arq.nome}</div>
        <div class="file-meta">${arq.meta}</div>
      </div>
      <a href="#" role="button">${arq.disponivel ? "Baixar" : "Bloqueado"}</a>
    `;
    li.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      if (arq.disponivel) arq.action();
    });
    ul.appendChild(li);
  });
}

// SVG simples para evolução do investimento (apenas Enterprise)
function graficoSVG(linhas) {
  const w = 640;
  const h = 320;
  const pad = 40;
  const maxY = Math.max(...linhas.map((l) => l.acumulado));
  const sx = (i) => pad + (i * (w - 2 * pad)) / (linhas.length - 1);
  const sy = (v) => h - pad - (v / maxY) * (h - 2 * pad);

  const pathComp = linhas.map((l, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(l.acumulado)}`).join(" ");
  const pathSimp = linhas.map((l, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(l.simples)}`).join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#0b1020"/>
  <text x="${pad}" y="24" fill="#e8ecff" font-family="sans-serif" font-size="14">Evolução do investimento</text>
  <path d="${pathSimp}" stroke="#97a0c8" fill="none" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="${pathComp}" stroke="#38e0c1" fill="none" stroke-width="2.5"/>
  <text x="${pad}" y="${h - 12}" fill="#97a0c8" font-family="sans-serif" font-size="11">Trimestres: 0 → ${linhas.length - 1}</text>
  <text x="${w - pad - 130}" y="${h - 12}" fill="#38e0c1" font-family="sans-serif" font-size="11">— Composto   </text>
  <text x="${w - pad - 60}" y="${h - 12}" fill="#97a0c8" font-family="sans-serif" font-size="11">-- Simples</text>
</svg>`;
}

// --- Reiniciar jornada ---
document.getElementById("btn-reiniciar").addEventListener("click", () => {
  document.getElementById("form-cadastro").reset();
  document.getElementById("form-calculo").reset();
  document.getElementById("form-pagamento").reset();
  document.getElementById("resultado-k").classList.add("hidden");
  document.getElementById("acoes-calculo").classList.add("hidden");
  state.cadastro = state.calculo = state.resultado = state.plano = null;
  goToStep(1);
});
