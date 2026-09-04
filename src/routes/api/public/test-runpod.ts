import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/test-runpod")({
  server: {
    handlers: {
      GET: async () => {
        const { gpuConfigured } = await import("@/lib/cleaner-gpu.server");
        if (!gpuConfigured()) {
          return Response.json({ configured: false, message: "RUNPOD_API_KEY ou RUNPOD_ENDPOINT_ID ausentes" });
        }

        const id = process.env["RUNPOD_ENDPOINT_ID"]!;
        const key = process.env["RUNPOD_API_KEY"]!;

        // Testa o protocolo Queue (padrão do app)
        const queueUrl = `https://api.runpod.ai/v2/${id}/run`;
        let queueTest: any = { ok: false, status: 0, body: "" };
        try {
          const res = await fetch(queueUrl, {
            method: "POST",
            headers: {
              authorization: `Bearer ${key}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ input: { test: true } }),
          });
          queueTest.status = res.status;
          queueTest.body = await res.text();
          queueTest.ok = res.ok;
        } catch (e) {
          queueTest.error = String(e);
        }

        // Testa o protocolo Load Balancer (FastAPI direto)
        const lbUrl = `https://${id}.api.runpod.ai/v1/health`;
        let lbTest: any = { ok: false, status: 0, body: "" };
        try {
          const res = await fetch(lbUrl, {
            method: "GET",
            headers: { authorization: `Bearer ${key}` },
          });
          lbTest.status = res.status;
          lbTest.body = await res.text();
          lbTest.ok = res.ok;
        } catch (e) {
          lbTest.error = String(e);
        }

        return Response.json({
          configured: true,
          endpointId: id,
          queueTest,
          loadBalancerTest: lbTest,
        });
      },
    },
  },
});
