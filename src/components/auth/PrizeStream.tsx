import { BarChart3, Coins, Flame, Medal, Play, Scissors, Trophy, Wallet } from "lucide-react";
import { InstagramIcon, KwaiIcon, TikTokIcon, YouTubeIcon } from "@/components/brand-icons";

/** Elementos que sobem no "rio vertical" da vitrine. */
const FLOW = [
  { label: "Troféu", Icon: Trophy, tone: "warning" },
  { label: "Instagram", Icon: InstagramIcon, tone: "accent" },
  { label: "Moedas", Icon: Coins, tone: "warning" },
  { label: "TikTok", Icon: TikTokIcon, tone: "cyan" },
  { label: "Play", Icon: Play, tone: "primary" },
  { label: "Ranking", Icon: BarChart3, tone: "primary" },
  { label: "YouTube", Icon: YouTubeIcon, tone: "danger" },
  { label: "Carteira", Icon: Wallet, tone: "cyan" },
  { label: "Corte", Icon: Scissors, tone: "primary" },
  { label: "Kwai", Icon: KwaiIcon, tone: "warning" },
  { label: "Medalha", Icon: Medal, tone: "warning" },
  { label: "Em alta", Icon: Flame, tone: "danger" },
] as const;

/**
 * Corrente vertical de ícones em vidro, com trilhas de luz e partículas.
 * Puramente decorativo — nenhuma informação depende dele.
 */
export function PrizeStream() {
  return (
    <div aria-hidden className="auth-river">
      <span className="auth-trail auth-trail-a" />
      <span className="auth-trail auth-trail-b" />
      <span className="auth-trail auth-trail-c" />
      {FLOW.map(({ label, Icon, tone }, i) => (
        <span className={`auth-chip auth-tone-${tone}`} key={`${label}-${i}`}>
          <span className="auth-chip-glass">
            <Icon />
          </span>
        </span>
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <span className="auth-spark" key={`spark-${i}`} />
      ))}
    </div>
  );
}
