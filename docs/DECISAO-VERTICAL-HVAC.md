# Decisão estratégica — Vertical HVAC

**Data:** junho/2026  
**Decisão:** **Vertical HVAC** (não ERP genérico)  
**Decisor:** Helder  
**Status:** Aprovada — execução iniciada

---

## Contexto (§18 do documento funcional)

O HD ERP podia seguir dois caminhos:

| Caminho | Prós | Contras |
|---------|------|---------|
| **Genérico** | Serve qualquer manufatura | Compete com SAP, Omie, Totvs — guerra de features |
| **Vertical HVAC** | Domínio defensável; ninguém conhece filtro/HEPA como a HD | Nicho menor; exige vocabulário e fluxos do setor |

**Escolha:** vertical — *ERP de quem faz filtro e HVAC*.

A HD **é** a fábrica. O diferencial não é mais um módulo genérico — é saber o que é HEPA, BOM de filtro, teste de integridade e área classificada.

---

## Implicações práticas

1. **Prioridade de roadmap:** features que só um especialista HVAC pediria (ficha técnica, CQ de integridade, POPs HEPA) vêm **antes** de módulos genéricos.
2. **Linguagem do sistema:** terminologia HVAC na UI, onboarding e saúde do dado.
3. **Multi-tenant:** o core continua multi-tenant; cada implantação pode ser HVAC (HD interna) ou futuro cliente do nicho.
4. **Não reconstruir:** motor fiscal, MRP, financeiro e cronograma permanecem genéricos e determinísticos — o vertical **afina** cadastros e fluxos de CQ/expedição.

---

## Fatias de execução

| Fatia | Estado | Entrega |
|-------|--------|---------|
| **V0 — Decisão registada** | ✅ | Este documento + constantes `VERTICAL_ID` |
| **V1 — Ficha técnica produto** | ✅ | Colunas `hvac_*` em `products`, aba HVAC, API `/api/products/[id]/hvac-specs`, saúde do dado |
| **V2 — CQ integridade** | Pendente | Registo de teste PAO/DOP ligado à OP antes de expedir |
| **V3 — POPs e documentos HEPA** | Parcial | Biblioteca `product_documents` com tipo POP — falta template/checklist HEPA |
| **V4 — Orçamento HVAC** | Pendente | Campos de vazão/classe no orçamento e impressão PDF |
| **V5 — Área classificada** | Pendente | Rastreio de sala/linha ISO na produção |

---

## Validação (Helder)

1. Abrir produto acabado (AC ou HD1) → aba **HVAC** → preencher classe HEPA e vazão → gravar  
2. `/data-health` — não deve alertar "sem classe de filtro" após preencher  
3. `/onboarding` — item "ficha técnica HVAC" marca como feito  

---

## Referências

- §18 — `GUIA-SISTEMA-LAYOUT-E-FUNCIONAMENTO.md` (roadmap §12)
- Migration `20260928100000_hvac_product_specs.sql`
- Módulo `src/modules/hvac/lib/hvac-domain.ts`
