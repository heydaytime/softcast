import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sc-bg p-5 text-sc-text">
      <Link href="/" className="fixed left-4 top-4 z-10 rounded-sc-control border border-sc-border bg-sc-card px-4 py-2 text-[13px] font-semibold text-sc-muted transition hover:border-sc-border-strong hover:text-sc-text">
        &lt; Back to client
      </Link>
      <SignIn />
    </main>
  );
}
