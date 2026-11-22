import { cn } from "@/lib/utils";

export function RailLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={cn("h-5 w-5", className)} role="img" aria-label="POMP NET MOHAMMAD">
      <path d="M8 20L17 27L25 9L32 24L40 8L47 27L56 19L50 43H14L8 20Z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M14 48H50M18 54H46" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="8" cy="18" r="3.5" fill="#168CFF" /><circle cx="25" cy="8" r="3.5" fill="#A96BFF" /><circle cx="40" cy="7" r="3.5" fill="#168CFF" /><circle cx="57" cy="17" r="3.5" fill="#A96BFF" />
      <path d="M32 18L35 23L41 24L36.5 28L37.5 34L32 31L26.5 34L27.5 28L23 24L29 23L32 18Z" fill="#A96BFF" />
    </svg>
  );
}
