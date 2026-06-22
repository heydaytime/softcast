import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type SoftcastHeaderProps = {
  status?: string;
  action?: ReactNode;
  onBrandClick?: () => void;
};

export function SoftcastHeader({ status, action, onBrandClick }: SoftcastHeaderProps) {
  const brand = (
    <div className="flex items-center gap-3">
      <span className="h-3 w-3 rounded-full bg-sc-text shadow-[0_0_18px_rgb(244_245_246/0.22)]" />
      <span className="text-[14px] font-semibold text-sc-text">Softcast</span>
    </div>
  );

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-sc-border bg-sc-bg/96 px-4 backdrop-blur-xl">
      {onBrandClick ? (
        <button type="button" onClick={onBrandClick} className="rounded-sc-control px-1 py-1 transition hover:bg-white/[0.06]">
          {brand}
        </button>
      ) : brand}
      <div className="flex items-center gap-2">
        {status ? <StatusPill status={status} /> : null}
        {action}
      </div>
    </header>
  );
}

export function StatusPill({ status }: { status: string }) {
  const connected = status === "connected";
  return (
    <span
      title={status}
      className={connected
        ? "max-w-[160px] truncate rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[12px] font-medium text-emerald-100"
        : "max-w-[160px] truncate rounded-full border border-sc-border bg-sc-card px-3 py-1 text-[12px] font-medium text-sc-muted"}
    >
      {status}
    </span>
  );
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`h-10 rounded-sc-control bg-sc-primary px-4 text-[13px] font-semibold text-sc-primary-fg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 ${props.className || ""}`}
    />
  );
}

export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`h-10 rounded-sc-control border border-sc-border bg-sc-card px-4 text-[13px] font-semibold text-sc-muted transition hover:border-sc-border-strong hover:text-sc-text disabled:cursor-not-allowed disabled:opacity-45 ${props.className || ""}`}
    />
  );
}

export function SecondaryLink({ className = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      {...props}
      className={`inline-flex h-10 items-center rounded-sc-control border border-sc-border bg-sc-card px-4 text-[13px] font-semibold text-sc-muted transition hover:border-sc-border-strong hover:text-sc-text ${className}`}
    />
  );
}

export function AdminLink({ className = "", children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      {...props}
      className={`group inline-flex h-10 items-center gap-2 rounded-sc-control border border-sc-admin/40 bg-sc-admin/10 px-3.5 text-[13px] font-semibold text-sc-admin transition hover:border-sc-admin/70 hover:bg-sc-admin/20 hover:text-sc-admin-hover ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.2-2.9 7-7 8-4.1-1-7-3.8-7-8V6l7-3z" />
      </svg>
      {children}
    </Link>
  );
}

export function FieldInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-sc-control border border-sc-border bg-black px-3 text-[14px] text-sc-text outline-none transition placeholder:text-sc-faint focus:border-sc-border-strong disabled:cursor-not-allowed disabled:opacity-45 ${props.className || ""}`}
    />
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sc-faint">{children}</p>;
}

export function AuthControls() {
  return (
    <>
      <Show when="signed-out">
        <div className="flex items-center gap-2">
          <SignInButton>
            <button type="button" className="h-10 rounded-sc-control border border-sc-border bg-sc-card px-4 text-[13px] font-semibold text-sc-muted transition hover:border-sc-border-strong hover:text-sc-text">Sign in</button>
          </SignInButton>
          <SignUpButton>
            <button type="button" className="h-10 rounded-sc-control bg-sc-primary px-4 text-[13px] font-semibold text-sc-primary-fg transition hover:bg-white">Sign up</button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              // Pin the avatar to a fixed size so the header looks identical on every page
              // (the default Clerk avatar size can vary and made the admin nav feel smaller).
              userButtonAvatarBox: { width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem", overflow: "hidden", padding: 0 },
              avatarImage: { borderRadius: "0.5rem", width: "100%", height: "100%", objectFit: "cover" },
            },
          }}
        />
      </Show>
    </>
  );
}
