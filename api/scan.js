export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { prompt, imageBase64, mimeType } = req.body;
  const content = [];
  if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } });
  content.push({ type: "text", text: prompt });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, messages: [{ role: "user", content }] })
    });
    const data = await r.json();
    const txt = data.content?.[0]?.text || "";
    const clean = txt.replace(/```json/g, "").replace(/```/g, "").trim();
    res.status(200).json(JSON.parse(clean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
