

























































create or replace function public.fn_online_conta_id()
returns uuid language sql immutable as $$
  select '02eb0b02-58ee-4f08-90a6-b8de2268338d'::uuid
$$;

comment on function public.fn_online_conta_id() is
  '[ARRECADAÇÃO ONLINE] Conta Santander Ag 3957 C/C 13000422-2. O Matheus '
  'confirmou em 23/09/2026 que é a conta do canal online (a chave Pix do '
  'culto online aponta para ela; o Itaú é o presencial). NÃO é derivável do '
  'dado — o Itaú recebe 6x mais Pix de dízimo.';





create or replace function public.fn_online_forma_eletronica(p_forma text)
returns boolean language sql immutable as $$
  select lower(translate(coalesce(p_forma, ''),
                         'ÂÀÃÁÇÉÊÍÓÔÕÚâàãáçéêíóôõú',
                         'AAAACEEIOOOUaaaaceeiooou'))
         in ('pix', 'ted', 'transferencia')
$$;

comment on function public.fn_online_forma_eletronica(text) is
  '[ARRECADAÇÃO ONLINE] Pix/TED/Transferência com acento e caixa normalizados. '
  'fin_transacoes.forma_pagamento é TEXT sem CHECK — comparar cru devolve zero, '
  'e zero se lê como queda de arrecadação.';








create or replace function public.fn_online_arrecadacao(
  p_inicio date,
  p_fim date
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with parametros as (
  select public.fn_online_conta_id() as conta_id
),


bruto as (
  select
    t.valor,
    coalesce(t.data_pagamento, t.data_competencia) as data,
    t.descricao,
    t.classe_movimento,
    coalesce(pc.nome, '(sem plano de contas)') as plano,
    coalesce(t.forma_pagamento, '(forma não informada)') as forma,
    public.fn_online_forma_eletronica(t.forma_pagamento) as eletronica
  from public.fin_transacoes t
  cross join parametros p
  left join public.fin_plano_contas pc on pc.id = t.plano_contas_id
  where t.conta_id = p.conta_id
    and t.tipo = 'receita'
    
    and coalesce(t.status, '') <> 'cancelado'
    
    and t.classe_movimento in ('ordinaria', 'extraordinaria')
    
    and (t.lancamento_bruto_id is null or t.codigo_legado is not null)
    and coalesce(t.data_pagamento, t.data_competencia) between p_inicio and p_fim
),
dentro as (
  select * from bruto where eletronica
),



corte as (
  select max(coalesce(t.data_pagamento, t.data_competencia)) as ultima_data
  from public.fin_transacoes t
  cross join parametros p
  where t.conta_id = p.conta_id and t.tipo = 'receita'
),
semanal as (
  select s.inicio, s.fim, s.label,
         sum(d.valor) as total, count(*) as n
  from dentro d
  cross join lateral public.fin_semana_qua_ter(d.data) s
  group by s.inicio, s.fim, s.label
),
mensal as (
  select to_char(d.data, 'YYYY-MM') as mes,
         sum(d.valor) as total, count(*) as n,
         
         
         
         count(distinct d.data) filter (where extract(isodow from d.data) = 1) as dias_segunda
  from dentro d
  group by 1
),
composicao as (
  select plano, sum(valor) as total, count(*) as n
  from dentro group by 1
),


fora as (
  select forma, sum(valor) as total, count(*) as n
  from bruto where not eletronica group by 1
),
por_doador as (
  
  
  select coalesce(nullif(btrim(descricao), ''), '(sem nome)') as doador,
         sum(valor) as total
  from dentro group by 1
),
ranking as (
  select total, row_number() over (order by total desc) as pos,
         sum(total) over () as geral, count(*) over () as doadores
  from por_doador
)
select jsonb_build_object(
  'inicio', p_inicio,
  'fim', p_fim,
  'corte', (select ultima_data from corte),
  'total', (select coalesce(sum(valor), 0) from dentro),
  'lancamentos', (select count(*) from dentro),
  
  
  'ticket_mediano', (select percentile_cont(0.5) within group (order by valor) from dentro),
  'ticket_medio', (select avg(valor) from dentro),
  'semanas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'inicio', inicio, 'fim', fim, 'label', label,
      'total', total, 'n', n) order by inicio)
    from semanal), '[]'::jsonb),
  'meses', coalesce((
    select jsonb_agg(jsonb_build_object(
      'mes', mes, 'total', total, 'n', n, 'dias_segunda', dias_segunda) order by mes)
    from mensal), '[]'::jsonb),
  'composicao', coalesce((
    select jsonb_agg(jsonb_build_object('plano', plano, 'total', total, 'n', n)
                     order by total desc)
    from composicao), '[]'::jsonb),
  'fora_do_recorte', coalesce((
    select jsonb_agg(jsonb_build_object('forma', forma, 'total', total, 'n', n)
                     order by total desc)
    from fora), '[]'::jsonb),
  'concentracao', jsonb_build_object(
    'doadores', (select max(doadores) from ranking),
    'top10_pct', (select round(sum(total) / nullif(max(geral), 0) * 100, 1) from ranking where pos <= 10),
    'top50_pct', (select round(sum(total) / nullif(max(geral), 0) * 100, 1) from ranking where pos <= 50)
  )
)
$$;

comment on function public.fn_online_arrecadacao(date, date) is
  '[ARRECADAÇÃO ONLINE] Série semanal (QUA→TER, fin_semana_qua_ter), mensal, '
  'composição, concentração e a cauda do que ficou fora, numa viagem só. '
  'Agregação no banco porque o PostgREST corta em 1000 linhas em silêncio e a '
  'semana financeira é função SQL. Recorte: conta do online + receita viva '
  '(status<>cancelado, classe ordinaria/extraordinaria, anti dupla contagem '
  'OFX) + forma eletrônica. NÃO filtra plano de contas de propósito — plano '
  'novo entra e aparece na composição, em vez de sumir em silêncio.';





revoke all on function public.fn_online_arrecadacao(date, date) from public, anon, authenticated;
revoke all on function public.fn_online_conta_id() from public, anon, authenticated;
revoke all on function public.fn_online_forma_eletronica(text) from public, anon, authenticated;
grant execute on function public.fn_online_arrecadacao(date, date) to service_role;
grant execute on function public.fn_online_conta_id() to service_role;
grant execute on function public.fn_online_forma_eletronica(text) to service_role;


do $$
declare
  v jsonb;
  v_total numeric;
  v_semanas int;
begin
  select public.fn_online_arrecadacao('2026-01-01', '2026-09-23') into v;
  v_total := (v->>'total')::numeric;
  v_semanas := jsonb_array_length(v->'semanas');

  if v_total is null or v_total <= 0 then
    raise exception 'ABORT: fn_online_arrecadacao devolveu total vazio (%)', v_total;
  end if;
  if v_semanas < 30 then
    raise exception 'ABORT: esperava ~38 semanas em 2026, vieram %', v_semanas;
  end if;

  raise notice 'OK · 2026 ate 23/09: R$ % em % lancamentos, % semanas, corte %',
    round(v_total, 2), v->>'lancamentos', v_semanas, v->>'corte';
end $$;
