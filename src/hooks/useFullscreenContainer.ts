import * as React from "react";
















export const PortalContainerContext = React.createContext<HTMLElement | null>(null);










export function useFullscreenContainer(): HTMLElement | undefined {
  const [container, setContainer] = React.useState<HTMLElement | undefined>(undefined);
  const declarado = React.useContext(PortalContainerContext);

  React.useEffect(() => {
    const update = () => {
      const fs = (document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        null) as HTMLElement | null;
      setContainer(fs ?? undefined);
    };
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);



  return container ?? declarado ?? undefined;
}
