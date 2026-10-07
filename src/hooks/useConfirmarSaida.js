


















import { useRef, useCallback } from 'react';

export const MSG_CONFIRMAR_SAIDA =
  'Tem certeza que deseja sair? As alterações não salvas serão perdidas.';

export default function useConfirmarSaida(temAlteracoes, onClose) {



  const mousedownNoBackdropRef = useRef(false);

  const tentarFechar = useCallback(() => {
    if (temAlteracoes && !window.confirm(MSG_CONFIRMAR_SAIDA)) return;
    onClose?.();
  }, [temAlteracoes, onClose]);

  const backdropProps = {
    onMouseDown: (e) => { mousedownNoBackdropRef.current = e.target === e.currentTarget; },
    onClick: (e) => { if (e.target === e.currentTarget && mousedownNoBackdropRef.current) tentarFechar(); },
  };

  return { tentarFechar, backdropProps };
}
