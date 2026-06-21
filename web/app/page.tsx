"use client";

import { useState } from "react";
import { explorer } from "@sdk/config";
import styles from "./page.module.css";

const EXAMPLE_ANCHOR =
  "0x33af33271752eb7c7a00478c51a9b44ac1851fde3075947c81434baa8cd2deb0";

type Check = { name: string; ok: boolean; detail?: string };

type Entry = { action: string; resource: string; outcome: string };

type Report = {
  valid: boolean;
  anchorObjectId: string;
  blobId: string;
  anchor: { agentDid: string; publisher: string };
  manifest?: { actionLog: { entries: Entry[] }; citedInputBlobIds?: string[] };
  checks: Check[];
};

export default function Home() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify(anchorObjectId: string, tamper = false) {
    setLoading(true);
    setReport(null);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorObjectId, tamper }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verification failed");
      setReport(data as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const entries = report?.manifest?.actionLog.entries ?? [];
  const citedInputs = report?.manifest?.citedInputBlobIds ?? [];
  const blockedCount = entries.filter((e) => e.outcome === "blocked").length;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Proof-of-Agent</h1>
      <p className={styles.tagline}>
        Verify an AI agent&apos;s entire run from a single Sui object ID — reconstructed
        from public data alone. Reads the on-chain anchor, confirms the genuine Walrus
        blob, then re-checks every signature and the receipt hash chain.
      </p>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (id.trim()) verify(id.trim());
        }}
      >
        <input
          className={styles.input}
          placeholder="0x… anchor object ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          spellCheck={false}
        />
        <button className={styles.button} type="submit" disabled={loading || !id.trim()}>
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>
      <p className={styles.example}>
        No ID handy?{" "}
        <button
          type="button"
          onClick={() => {
            setId(EXAMPLE_ANCHOR);
            verify(EXAMPLE_ANCHOR);
          }}
        >
          Verify an example run
        </button>{" "}
        ·{" "}
        <button
          type="button"
          onClick={() => {
            setId(EXAMPLE_ANCHOR);
            verify(EXAMPLE_ANCHOR, true);
          }}
        >
          Tamper a receipt
        </button>
      </p>

      {error && <div className={styles.error}>{error}</div>}

      {report && (
        <section className={styles.result}>
          <span
            className={`${styles.badge} ${report.valid ? styles.badgePass : styles.badgeFail}`}
          >
            {report.valid ? "Verified" : "Verification failed"}
          </span>

          <dl className={styles.summary}>
            <dt>Agent</dt>
            <dd className="mono">{report.anchor.agentDid}</dd>
            <dt>Blob</dt>
            <dd className="mono">{report.blobId}</dd>
            <dt>Publisher</dt>
            <dd className="mono">{report.anchor.publisher}</dd>
          </dl>

          {entries.length > 0 && (
            <div className={styles.actions}>
              {entries.map((e, i) => (
                <div className={styles.action} key={i}>
                  <span
                    className={`${styles.outcome} ${
                      e.outcome === "blocked" ? styles.outcomeBlocked : styles.outcomeOk
                    }`}
                  >
                    {e.outcome === "blocked" ? "blocked" : e.outcome}
                  </span>
                  <span className={styles.actionName}>
                    {e.action} <span className="mono">{e.resource}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {blockedCount > 0 && (
            <p className={styles.note}>
              {blockedCount} action{blockedCount > 1 ? "s were" : " was"} blocked by the covenant —
              the denial is recorded as a receipt, and the verifier re-ran the policy to confirm it.
              That&apos;s the guardrail working, so verification stays green.
            </p>
          )}

          {citedInputs.length > 0 && (
            <div className={styles.cited}>
              <span className={styles.citedLabel}>Inputs re-fetched from Walrus</span>
              {citedInputs.map((id) => (
                <a
                  key={id}
                  className="mono"
                  href={explorer.blob(id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {id} ↗
                </a>
              ))}
            </div>
          )}

          <div className={styles.checks}>
            {report.checks.map((c) => (
              <div className={styles.check} key={c.name}>
                <span className={`${styles.mark} ${c.ok ? styles.markPass : styles.markFail}`}>
                  {c.ok ? "✓" : "✕"}
                </span>
                <span className={styles.checkName}>
                  {c.name}
                  {c.detail && <span className={styles.detail}>{c.detail}</span>}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.links}>
            <a href={explorer.object(report.anchorObjectId)} target="_blank" rel="noreferrer">
              Anchor on SuiVision ↗
            </a>
            <a href={explorer.blob(report.blobId)} target="_blank" rel="noreferrer">
              Blob on Walruscan ↗
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
