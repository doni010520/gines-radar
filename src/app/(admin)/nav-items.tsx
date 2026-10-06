import { IconBuilding, IconClock, IconInbox } from "@/components/icons";

/** Uma definição só das abas, usada pelo cabeçalho do desktop e pela barra do celular. */
export const NAV_ITEMS = [
  { href: "/oportunidades", label: "Oportunidades", Icon: IconInbox },
  { href: "/bairros", label: "Bairros e filtros", Icon: IconBuilding },
  { href: "/config", label: "Configuração", Icon: IconClock },
] as const;
