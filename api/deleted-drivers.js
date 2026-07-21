// Vercel Serverless Function
// GET  -> returns the list of driver names that have been deleted
// POST -> body: { name, password } - checks password on the SERVER (never sent to the browser)
//         and, if correct, adds the driver name to the deleted list.

//
//
// Storage: Upstash Redis, connected through Vercel's Marketplace Storage integration.
// That integration automatically creates the env vars KV_REST_API_URL and KV_REST_API_TOKEN.
// You also need to manually add an env var DRIVER_DELETE_PASSWORD with the password value.

export default async function handler(req, res) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({
      error: 'Storage não configurado. Conecte um banco Redis (Marketplace Storage) ao projeto na Vercel.'
    });
  }

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${KV_URL}/smembers/deleted_drivers`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await r.json();
      return res.status(200).json({ deleted: data.result || [] });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar motoristas excluídos.' });
    }
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { name, password } = body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Nome do motorista é obrigatório.' });
    }
    if (!process.env.DRIVER_DELETE_PASSWORD) {
      return res.status(500).json({ error: 'Senha de exclusão não configurada no servidor.' });
    }
    if (password !== process.env.DRIVER_DELETE_PASSWORD) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    try {
      await fetch(`${KV_URL}/sadd/deleted_drivers/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao excluir motorista.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Método não permitido.' });
}
