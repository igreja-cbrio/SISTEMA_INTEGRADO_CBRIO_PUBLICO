import { useState, useEffect, useCallback } from 'react';
import { marketing as api, marketingLinha } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import MarketingPagina from './MarketingPagina';
import { Faixa } from './dashboardPecas';
import InicioLab22 from './inicio/InicioLab22';


























export default function MarketingInicio() {
  const { profile } = useAuth();




  const [linha, setLinha] = useState(null);
  const [carregandoLinha, setCarregandoLinha] = useState(true);
  const [erroLinha, setErroLinha] = useState(null);
  useEffect(() => {
    let vivo = true;
    marketingLinha.get(new Date().getFullYear())
      .then((r) => { if (vivo) { setLinha(r); setErroLinha(null); } })
      .catch((e) => { if (vivo) setErroLinha(e?.message || 'erro ao carregar'); })
      .finally(() => { if (vivo) setCarregandoLinha(false); });
    return () => { vivo = false; };
  }, []);

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await api.dashboard.get({}));
    } catch (e) {


      setErro(e.message || 'Não foi possível carregar o início do Marketing');
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);



  const [avisos, setAvisos] = useState(null);
  const [erroAvisos, setErroAvisos] = useState(null);
  const carregarAvisos = useCallback(async () => {
    try {
      setAvisos(await api.avisosInicio.list());
      setErroAvisos(null);
    } catch (e) {
      setErroAvisos(e?.message || 'erro ao carregar');
    }
  }, []);
  useEffect(() => { carregarAvisos(); }, [carregarAvisos]);

  return (
    <MarketingPagina>
      <InicioLab22
        dash={dados}
        erroDash={erro}
        linha={linha}
        carregandoLinha={carregandoLinha}
        erroLinha={erroLinha}
        nome={profile?.name}
        avisos={avisos}
        erroAvisos={erroAvisos}
        onRecarregarAvisos={carregarAvisos}
      />

      {erro && <Faixa>{erro} <button onClick={carregar} className="underline font-medium">Tentar de novo</button></Faixa>}
    </MarketingPagina>
  );
}
