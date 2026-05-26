"use client";

import { useState } from "react";
import Link from "next/link";
import { redeemCode } from "@/lib/backend";

export default function Home() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const target = await redeemCode(code);
      const href = target.subSessionId ? `/screen/${target.sessionId}/${target.subSessionId}` : `/session/${target.sessionId}`;
      window.location.href = href;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not verify code");
    }
  }

  return (
    <main className="min-h-dvh bg-black text-[#f5f5f7]">
      <header className="flex h-12 items-center justify-between bg-black px-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-white" />
          <h1 className="text-[14px] font-semibold tracking-[-0.02em]">Softcast</h1>
          <span className="hidden text-[12px] text-white/32 sm:inline">Client</span>
        </div>
        <Link href="/admin" className="rounded-full bg-[#ff3b30] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#ff453a]">Admin</Link>
      </header>
      <section className="mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-[520px] flex-col justify-center px-5 py-10">
        <div className="mb-12 text-center">
          <h1 className="text-[46px] font-semibold leading-[0.94] tracking-[-0.055em] text-white sm:text-[64px]">Pair a display.</h1>
          <p className="mx-auto mt-5 max-w-[400px] text-[17px] leading-7 text-white/52">Enter the verification code from your controller to join a screen or session chooser.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="sr-only" htmlFor="code">Verification code</label>
          <input id="code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="000000" className="h-20 w-full rounded-[24px] border border-white/10 bg-[#0b0b0c] px-6 text-center text-[40px] font-semibold tracking-[0.24em] text-white outline-none transition focus:border-white/28 focus:bg-[#111113]" />
          <button className="h-14 w-full rounded-full bg-white text-[16px] font-semibold text-black transition hover:bg-white/88">Continue</button>
          {error ? <p className="text-center text-[13px] text-[#ff6961]">{error}</p> : null}
        </form>

      </section>
    </main>
  );
}
