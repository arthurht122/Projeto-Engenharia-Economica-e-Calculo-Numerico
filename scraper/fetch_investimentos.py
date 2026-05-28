"""
Scraper de renda fixa do Investidor10.

Gera ../data/investimentos.json (consumido pela landing page) e tambem
um CSV com timestamp para historico.

Uso:
    pip install playwright pandas
    python -m playwright install chromium
    python scraper/fetch_investimentos.py

A landing page faz fetch de data/investimentos.json. Sem rodar este
script, ela cai num dataset embutido (fallback) presente no script.js.
"""

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd
from playwright.async_api import async_playwright

URL_RENDA_FIXA = "https://investidor10.com.br/renda-fixa/"
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)


async def buscar_dados_renda_fixa(url: str) -> list[dict]:
    dados_investimentos: list[dict] = []

    async with async_playwright() as p:
        navegador = await p.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        pagina = await navegador.new_page()

        print(f"⏳ Acessando {url}...")
        await pagina.goto(url, wait_until="domcontentloaded", timeout=30000)
        await pagina.wait_for_timeout(8000)

        dados = await pagina.evaluate(
            """() => {
            const resultados = [];
            const elementos = document.querySelectorAll('*');
            const cardsProcessados = new Set();

            elementos.forEach(el => {
                if (el.innerText && el.innerText.includes('Rentabilidade bruta') && el.innerText.includes('Distribuidor')) {
                    if (cardsProcessados.has(el)) return;
                    cardsProcessados.add(el);

                    const texto = el.innerText;
                    const tipoMatch = texto.match(/^(CDB|LCA|LCI|CRI|CRA|Debênture Incentivada|Debênture|LC|LF)/m);
                    if (!tipoMatch) return;

                    const tipo = tipoMatch[0];
                    const rentBruta = (texto.match(/Rentabilidade bruta\\s*([\\d,]+%\\s*a\\.a)/) || ['', ''])[1];
                    const rentLiquida = (texto.match(/Rentabilidade líquida\\s*([\\d,]+%\\s*a\\.a)/) || ['', ''])[1];
                    const invMinimo = (texto.match(/Investimento mínimo\\s*(R\\$\\s*[\\d.,]+)/) || ['', ''])[1];
                    const distribuidor = (texto.match(/Distribuidor\\s*(.+?)(?:\\n|Emissor)/) || ['', ''])[1]?.trim();
                    const emissor = (texto.match(/Emissor\\s*(.+?)(?:\\n|Liquidez)/) || ['', ''])[1]?.trim();
                    const liquidez = (texto.match(/Liquidez\\s*(Diária|No Vencimento)/) || ['', ''])[1];
                    const prazo = (texto.match(/Prazo de resgate\\s*(\\d{2}\\/\\d{2}\\/\\d{4})/) || ['', ''])[1];

                    resultados.push({
                        tipo,
                        rentabilidade_bruta: rentBruta || 'N/A',
                        rentabilidade_liquida: rentLiquida || 'N/A',
                        investimento_minimo: invMinimo || 'N/A',
                        distribuidor: distribuidor || 'N/A',
                        emissor: emissor || 'N/A',
                        liquidez: liquidez || 'N/A',
                        prazo_resgate: prazo || 'N/A',
                    });
                }
            });
            return resultados;
            }"""
        )

        print(f"🔍 Encontrados {len(dados)} cards de investimento")
        await navegador.close()

        for item in dados:
            nome_completo = f"{item['tipo']} {item.get('emissor', '')}".strip()
            dados_investimentos.append(
                {
                    "Descricao": nome_completo,
                    "Tipo": item["tipo"],
                    "Investimento Minimo": item["investimento_minimo"],
                    "Rentabilidade Bruta": item["rentabilidade_bruta"],
                    "Rentabilidade Liquida": item["rentabilidade_liquida"],
                    "Distribuidor": item["distribuidor"],
                    "Emissor": item["emissor"],
                    "Liquidez": item["liquidez"],
                    "Prazo de Resgate": item["prazo_resgate"],
                }
            )

    return dados_investimentos


def parse_rent_anual(texto: str) -> float | None:
    """Converte '12,50% a.a' -> 12.5"""
    if not texto:
        return None
    m = re.search(r"([\d,.]+)\s*%", texto)
    if not m:
        return None
    return float(m.group(1).replace(".", "").replace(",", "."))


def parse_inv_minimo(texto: str) -> float | None:
    """Converte 'R$ 1.000,00' -> 1000.0"""
    if not texto:
        return None
    m = re.search(r"R\$\s*([\d.,]+)", texto)
    if not m:
        return None
    return float(m.group(1).replace(".", "").replace(",", "."))


def parse_prazo_meses(texto: str) -> int | None:
    """Converte 'DD/MM/YYYY' em meses ate o vencimento."""
    if not texto or texto == "N/A":
        return None
    try:
        venc = datetime.strptime(texto, "%d/%m/%Y")
        hoje = datetime.now()
        return max(1, (venc.year - hoje.year) * 12 + (venc.month - hoje.month))
    except ValueError:
        return None


def enriquecer(dados: list[dict]) -> list[dict]:
    """Adiciona campos numericos para a landing page consumir direto."""
    enriquecido = []
    for d in dados:
        e = dict(d)
        e["rentabilidade_bruta_aa"] = parse_rent_anual(d.get("Rentabilidade Bruta", ""))
        e["rentabilidade_liquida_aa"] = parse_rent_anual(d.get("Rentabilidade Liquida", ""))
        e["investimento_minimo_num"] = parse_inv_minimo(d.get("Investimento Minimo", ""))
        e["prazo_meses"] = parse_prazo_meses(d.get("Prazo de Resgate", ""))
        enriquecido.append(e)
    return enriquecido


async def main():
    dados = await buscar_dados_renda_fixa(URL_RENDA_FIXA)

    if not dados:
        print("\n❌ Nenhum dado extraido. Verifique o HTML.")
        return

    df = pd.DataFrame(dados)
    print(f"\n✅ {len(dados)} investimentos encontrados.\n")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)
    pd.set_option("display.max_colwidth", 30)
    print(df.to_string(index=False))

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = DATA_DIR / f"renda_fixa_completo_{timestamp}.csv"
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    print(f"\n💾 CSV: {csv_path}")

    enriquecido = enriquecer(dados)
    json_path = DATA_DIR / "investimentos.json"
    json_path.write_text(
        json.dumps(
            {
                "atualizado_em": datetime.now().isoformat(timespec="seconds"),
                "fonte": URL_RENDA_FIXA,
                "investimentos": enriquecido,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"💾 JSON consumido pela landing page: {json_path}")


if __name__ == "__main__":
    asyncio.run(main())
