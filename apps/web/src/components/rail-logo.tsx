import { cn } from "@/lib/utils";

export function RailLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={cn("h-5 w-5", className)} role="img" aria-label="POMP NET MOHAMMAD">
      <path d="M10 54V10h22c12 0 19 6 19 17S44 44 32 44H22v10H10Z" fill="currentColor"/>
      <path d="M22 21v12h10c5 0 8-2 8-6s-3-6-8-6H22Z" fill="#111020"/>
      <path d="M42 54 54 10h-9L33 54h9Z" fill="#168CFF"/>
    </svg>
  );
}
