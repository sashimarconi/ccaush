const BLACKCAT_BASE_URL = "https://api.blackcatpay.com.br/api";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.BLACKCAT_SECRET_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "BLACKCAT_SECRET_KEY not configured on server",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const amount = Number(body.amount || 0);
    const customer = body.customer || {};
    const customerDocument = customer.document || {};
    const customerAddress = customer.address || {};
    const incomingItems = Array.isArray(body.items) ? body.items : [];

    if (!amount || amount <= 0) {
      return sendJson(res, 400, { error: "amount must be greater than 0" });
    }

    if (!customer.name || !customer.email) {
      return sendJson(res, 400, { error: "customer name and email are required" });
    }

    if (incomingItems.length === 0) {
      return sendJson(res, 400, { error: "at least one item is required" });
    }

    const items = incomingItems.map((item) => ({
      title: item.title,
      unitPrice: Number(item.unitPrice || 0),
      quantity: Number(item.quantity || 1),
      tangible: Boolean(item.tangible),
    }));

    const hasTangible = items.some((item) => item.tangible);

    const payload = {
      amount,
      currency: "BRL",
      paymentMethod: "pix",
      items,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: onlyDigits(customer.phone),
        document: {
          number: onlyDigits(customerDocument.number),
          type: String(customerDocument.type || "cpf").toLowerCase(),
        },
      },
      pix: {
        expiresInDays: Number((body.pix && body.pix.expiresInDays) || 1),
      },
      externalRef:
        customer.externalRef ||
        (body.metadata && body.metadata.order_number) ||
        `PED-${Date.now()}`,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      postbackUrl: process.env.BLACKCAT_POSTBACK_URL || undefined,
    };

    if (hasTangible) {
      payload.shipping = {
        name: customer.name,
        street: customerAddress.street || "",
        number: customerAddress.streetNumber || "",
        complement: customerAddress.complement || "",
        neighborhood: customerAddress.neighborhood || "",
        city: customerAddress.city || "",
        state: customerAddress.state || "",
        zipCode: onlyDigits(customerAddress.zipCode),
      };
    }

    const blackcatRes = await fetch(`${BLACKCAT_BASE_URL}/sales/create-sale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await blackcatRes.text();
    let blackcatJson;

    try {
      blackcatJson = responseText ? JSON.parse(responseText) : {};
    } catch {
      blackcatJson = { raw: responseText };
    }

    if (!blackcatRes.ok || blackcatJson.success === false) {
      return sendJson(res, blackcatRes.status || 500, {
        error:
          blackcatJson.message ||
          blackcatJson.error ||
          "Erro ao criar venda PIX na BlackCatPay",
        details: blackcatJson,
      });
    }

    const data = (blackcatJson && blackcatJson.data) || {};
    const paymentData = data.paymentData || {};

    const qrCodeValue =
      paymentData.copyPaste ||
      paymentData.qrCode ||
      paymentData.qrCodeBase64 ||
      "";

    return sendJson(res, 200, {
      data: {
        id: data.transactionId || null,
        qrCode: qrCodeValue,
        pix: {
          qrcode: qrCodeValue,
          copyPaste: paymentData.copyPaste || qrCodeValue,
          qrCodeBase64: paymentData.qrCodeBase64 || null,
          expiresAt: paymentData.expiresAt || null,
        },
        status: data.status || "PENDING",
      },
    });
  } catch (err) {
    return sendJson(res, 500, {
      error: err instanceof Error ? err.message : "Unexpected server error",
    });
  }
}
