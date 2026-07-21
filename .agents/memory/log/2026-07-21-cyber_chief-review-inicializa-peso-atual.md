# Log — Security review: inicializar peso_atual_kg ao completar pendência — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-21
- **Migration:** `20260721010000_inicializa_peso_atual_ao_completar_pendencia.sql`.
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push`.

## Análise

Trigger `BEFORE UPDATE OF peso_inicial_kg`, sem `SECURITY DEFINER` (padrão invoker). Ponto
central verificado: o guard `prevent_animais_campos_calculados_change()` (Fase 2) só dispara
quando o próprio comando UPDATE do cliente lista `peso_atual_kg`/`gmd_medio_kg`/
`ultima_pesagem_data` no `SET` — não quando um trigger BEFORE anterior modifica `NEW` para
essas colunas internamente. Validado por dois testes reais, não só leitura da documentação do
Postgres: (1) UPDATE que só lista `identificacao`/`lote_id`/`status`/`data_nascimento`/
`peso_inicial_kg` — `peso_atual_kg` é inicializado corretamente pelo novo trigger, sem erro;
(2) UPDATE que lista `peso_atual_kg` diretamente — continua bloqueado pelo guard original, sem
regressão.

## Mudanças de arquivo

Nenhuma — aprovada como está.
