import { Link } from "wouter";

interface PlayerLinkProps {
  name: string;
  style?: React.CSSProperties;
}

export default function PlayerLink({ name, style }: PlayerLinkProps) {
  return (
    <Link
      href={`/player/${encodeURIComponent(name)}`}
      style={{
        color: "var(--text)",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 14,
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.color = "var(--amber)";
        (e.target as HTMLElement).style.textDecoration = "underline";
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.color = style?.color ?? "var(--text)";
        (e.target as HTMLElement).style.textDecoration = "none";
      }}
    >
      {name}
    </Link>
  );
}
