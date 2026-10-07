


























const CATEGORIAS_POR_SEXO = { mulheres: 'feminino', homens: 'masculino' };


function sexoNormalizado(valor) {
  const s = String(valor ?? '').trim().toLowerCase();
  if (s === 'masculino' || s === 'm') return 'masculino';
  if (s === 'feminino' || s === 'f') return 'feminino';
  return null;
}












function avaliarEntradaNoGrupo({ grupo, genero, temporadaAberta } = {}) {
  if (!grupo || grupo.deleted_at) {
    return { ok: false, status: 404, codigo: 'grupo_nao_encontrado', erro: 'Grupo não encontrado.' };
  }




  if (grupo.ativo === false) {
    return {
      ok: false, status: 403, codigo: 'inscricoes_fechadas',
      erro: 'Este grupo não está recebendo novas inscrições no momento.',
    };
  }







  if (grupo.aceitando_inscricoes === false) {
    return {
      ok: false, status: 403, codigo: 'inscricoes_fechadas',
      erro: 'Este grupo não está recebendo novas inscrições no momento.',
    };
  }




  if (grupo.temporada && String(grupo.modo_inscricao || '') !== 'sempre_aberto' && temporadaAberta !== true) {
    return {
      ok: false, status: 403, codigo: 'inscricoes_fechadas',
      erro: 'As inscrições para esta temporada estão fechadas no momento. Aguarde a próxima abertura.',
    };
  }

  const exigido = CATEGORIAS_POR_SEXO[String(grupo.categoria || '').trim().toLowerCase()];
  if (exigido) {
    const meu = sexoNormalizado(genero);


















    if (meu !== exigido) {
      return {
        ok: false, status: 422, codigo: 'grupo_incompativel',
        erro: !meu
          ? 'Complete seu cadastro no app (inclusive o sexo) para se inscrever neste grupo.'
          : exigido === 'feminino'
            ? 'Este é um grupo só de mulheres, então sua inscrição não pode seguir nele.'
            : 'Este é um grupo só de homens, então sua inscrição não pode seguir nele.',
      };
    }
  }

  return { ok: true };
}

module.exports = { CATEGORIAS_POR_SEXO, sexoNormalizado, avaliarEntradaNoGrupo };
