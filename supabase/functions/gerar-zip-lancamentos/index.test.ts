// ============================================================================
// Testes de supabase/functions/gerar-zip-lancamentos/
//
// Mesma nota honesta de cobertura de enviar-convite/ e classificar-documento/:
// o handler HTTP completo (Deno.serve em index.ts) instancia um client
// Supabase real e faz chamadas de rede (auth.getUser, .from().select(),
// storage.download, JSZip.generateAsync) — não coberto aqui. Este arquivo
// importa só de ./logica.ts.
//
// Honestidade adicional: estes testes NÃO foram executados nesta sessão —
// ambiente de desenvolvimento (Windows) não tem o Deno CLI instalado.
// ============================================================================

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  calcularIntervaloDoMes,
  nomeArquivoNoZip,
  ordenarPorDataCrescente,
  validarAnoMes,
} from './logica.ts'

Deno.test('calcularIntervaloDoMes calcula o último dia certo, inclusive em fevereiro', () => {
  assertEquals(calcularIntervaloDoMes(2026, 7), { dataInicio: '2026-07-01', dataFim: '2026-07-31' })
  assertEquals(calcularIntervaloDoMes(2026, 2), { dataInicio: '2026-02-01', dataFim: '2026-02-28' })
  assertEquals(calcularIntervaloDoMes(2028, 2), { dataInicio: '2028-02-01', dataFim: '2028-02-29' }) // bissexto
})

Deno.test('validarAnoMes rejeita mes fora de 1-12 e ano fora do intervalo razoável', () => {
  assertEquals(validarAnoMes(2026, 13), 'mes inválido (esperado 1-12)')
  assertEquals(validarAnoMes(2026, 0), 'mes inválido (esperado 1-12)')
  assertEquals(validarAnoMes(1999, 7), 'ano inválido')
  assertEquals(validarAnoMes(2026, 7), null)
})

Deno.test('ordenarPorDataCrescente ordena por data, desempatando por id', () => {
  const lista = [
    { id: 'b', data_lancamento: '2026-07-10' },
    { id: 'a', data_lancamento: '2026-07-01' },
    { id: 'c', data_lancamento: '2026-07-01' },
  ]
  const ordenado = ordenarPorDataCrescente(lista)
  assertEquals(
    ordenado.map((l) => l.id),
    ['a', 'c', 'b'],
  )
})

Deno.test('nomeArquivoNoZip gera nome com data + sequencial + entrada/saida + categoria', () => {
  const nome = nomeArquivoNoZip(
    {
      id: 'abc12345-0000-0000-0000-000000000000',
      data_lancamento: '2026-07-05',
      categoria: 'Insumos',
      tipo: 'despesa',
      arquivo_path: 'fazenda/2026-07/x.pdf',
    },
    3,
  )
  assertEquals(nome, '2026-07-05_003_saida_Insumos.pdf')
})

Deno.test('nomeArquivoNoZip usa "entrada" para receita e sanitiza categoria com acento', () => {
  const nome = nomeArquivoNoZip(
    {
      id: 'id',
      data_lancamento: '2026-01-02',
      categoria: 'Venda de Produção',
      tipo: 'receita',
      arquivo_path: 'x/y.jpg',
    },
    12,
  )
  assertEquals(nome, '2026-01-02_012_entrada_Venda-de-Producao.jpg')
})

Deno.test('nomes gerados em sequência ficam em ordem crescente de data quando ordenados alfabeticamente', () => {
  const lista = ordenarPorDataCrescente([
    { id: '2', data_lancamento: '2026-07-20', categoria: 'B', tipo: 'despesa' as const, arquivo_path: 'a.pdf' },
    { id: '1', data_lancamento: '2026-07-01', categoria: 'A', tipo: 'receita' as const, arquivo_path: 'b.pdf' },
    { id: '3', data_lancamento: '2026-07-31', categoria: 'C', tipo: 'despesa' as const, arquivo_path: 'c.pdf' },
  ])
  const nomes = lista.map((l, i) => nomeArquivoNoZip(l, i + 1))
  const nomesOrdenadosAlfabeticamente = [...nomes].sort()
  assertEquals(nomes, nomesOrdenadosAlfabeticamente)
})
