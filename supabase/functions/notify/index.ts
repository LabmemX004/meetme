// meetme · 邮件通知 Edge Function
// 部署方式见 README「邮箱通知」一节。部署后前端会把通知请求 POST 到这里。
// 需要 Secrets：
//   BREVO_API_KEY  — brevo.com 免费版（300 封/天）的 API Key
//   MAIL_FROM      — 已在 Brevo 后台完成验证的发件邮箱（如你的 Gmail/QQ 邮箱）
//
// 部署：
//   supabase functions deploy notify --project-ref <你的项目ref>
//   supabase secrets set BREVO_API_KEY=xxx MAIL_FROM=you@example.com

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  try {
    const { to, subject, text } = await req.json();
    if (!to || !subject || !text) {
      return new Response(JSON.stringify({ error: 'missing to/subject/text' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const apiKey = Deno.env.get('BREVO_API_KEY');
    const from = Deno.env.get('MAIL_FROM');
    if (!apiKey || !from) {
      return new Response(JSON.stringify({ error: 'BREVO_API_KEY / MAIL_FROM not set' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const resp = await fetch('https://api.brevo.com/api/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'meetme', email: from },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });
    const ok = resp.ok;
    const body = await resp.text();
    return new Response(JSON.stringify({ ok, detail: body.slice(0, 300) }), {
      status: ok ? 200 : 502, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
