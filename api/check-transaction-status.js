const BLACKCAT_BASE_URL = "https://api.blackcatpay.com.br/api";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.BLACKCAT_SECRET_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "BLACKCAT_SECRET_KEY not configured on server",
    });
  }

  const transactionId = (req.query && req.query.id) || "";
  if (!transactionId) {
    return sendJson(res, 400, { error: "Missing transaction id" });
  }

  try {
    const response = await fetch(
      `${BLACKCAT_BASE_URL}/sales/${encodeURIComponent(transactionId)}/status`,
      {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
        },
      }
    );

    const responseText = await response.text();
    let blackcatJson;

    try {
      blackcatJson = responseText ? JSON.parse(responseText) : {};
    } catch {
      blackcatJson = { raw: responseText };
    }

    if (!response.ok || blackcatJson.success === false) {
      return sendJson(res, response.status || 500, {
        error:
          blackcatJson.message ||
          blackcatJson.error ||
          "Erro ao consultar status na BlackCatPay",
        details: blackcatJson,
      });
    }

    const status =
      (blackcatJson && blackcatJson.data && blackcatJson.data.status) ||
      "PENDING";

    return sendJson(res, 200, {
      status,
      data: blackcatJson.data || {},
    });
  } catch (err) {
    return sendJson(res, 500, {
      error: err instanceof Error ? err.message : "Unexpected server error",
    });
  }
}
