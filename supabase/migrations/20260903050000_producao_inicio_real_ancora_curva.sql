

























alter table culto_producao
  add column if not exists inicio_real time;

comment on column culto_producao.inicio_real is
  'Hora real (BRT) em que o culto começou. Âncora para alinhar as etapas de produção com a curva de audiência do YouTube — a transmissão começa antes do culto. NULL = não informado.';
