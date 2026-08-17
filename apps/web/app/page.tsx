import { headers } from "next/headers";

export default async function HomePage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return (
    <main style={{ maxWidth: "44rem" }}>
      <h1 style={{ fontSize: "1rem" }}>agentlens</h1>
      <p>Replace github.com with this host. Your browser queries GitHub for the tree.</p>
      <pre style={{ overflow: "auto" }}>{`https://github.com/FullAgent/fulling
${origin}/FullAgent/fulling

${origin}/FullAgent/fulling/tree/main/src?preset=deploy`}</pre>
      <p>For a pipe-friendly text tree, use the CLI: <code>npx @norberia/agentlens</code></p>
    </main>
  );
}
