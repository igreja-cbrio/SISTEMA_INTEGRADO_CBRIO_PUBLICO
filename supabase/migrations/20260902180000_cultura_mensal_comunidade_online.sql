-- O indicador de comunidade NÃO É SOMADO ao indicador devocional.
-- O indicador de comunidade NÃO É SOMADO ao indicador devocional.






































ALTER TABLE public.cultura_mensal
  ADD COLUMN IF NOT EXISTS investir_comunidade_online int;

COMMENT ON COLUMN public.cultura_mensal.investir_comunidade_online IS
  'Pessoas na comunidade do Online no WhatsApp naquele mês (ESTOQUE acumulado, '
  'informado à mão na aba /online). ⚠️⚠️ NÃO É SOMADO ao devocional: a pétala '
  'Investir mostra as duas parcelas separadas. Somar enterraria a variação do '
  'devocional (medido em 02/09/2026: 2→14 pessoas de jul para ago, e a '
  'comunidade é ordem de grandeza maior). ⚠️ Diferente dos 4 campos vizinhos '
  '(freq_presencial_semanal, freq_online_semanal, decisoes_total, '
  'freq_grupos_total), que são OVERRIDE do valor calculado — este não '
  'sobrescreve nada, é um dado que só existe aqui. ⚠️ NULL = não informado, '
  'nunca 0.';
