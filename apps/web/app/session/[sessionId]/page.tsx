"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSoftcast } from "@/lib/use-softcast";

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { subSessionIds, status } = useSoftcast({ sessionId });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-black p-5 text-[#f5f5f7]">
      <section className="w-full max-w-[520px]">
        <p className="text-center text-[13px] text-white/34">Root session</p>
        <h1 className="mt-2 text-center text-[34px] font-semibold tracking-[-0.04em] text-white">Choose a screen</h1>
        <p className="mx-auto mt-3 max-w-[360px] text-center text-[14px] leading-6 text-white/45">Status: <span className={status === "connected" ? "font-medium text-emerald-300" : "text-white/45"}>{status}</span>. This page only routes this display into a screen.</p>
        <div className="mt-8 divide-y divide-white/[0.07] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#070708]">
          {subSessionIds.map((subSessionId) => (
            <Link key={subSessionId} href={`/screen/${sessionId}/${subSessionId}`} className="flex h-14 items-center justify-between px-4 text-[15px] text-white/72 transition hover:bg-white/[0.06] hover:text-white"><span>Screen {subSessionId.slice(0, 8)}</span><span className="text-white/25">Open</span></Link>
          ))}
        </div>
        {!subSessionIds.length ? <p className="mt-6 text-center text-[14px] text-white/42">No screens have been created yet.</p> : null}
      </section>
    </main>
  );
}
