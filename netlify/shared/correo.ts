// Envío del código de recuperación. Es opcional: si no hay RESEND_API_KEY,
// el API responde `enviado: false` y el administrador puede cambiar la contraseña desde su panel.
const REMITENTE = process.env.CORREO_DESDE ?? "IDEA ICFES <onboarding@resend.dev>";

export const correoConfigurado = () => Boolean(process.env.RESEND_API_KEY);

export async function enviarCodigo(destino: string, codigo: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: REMITENTE,
        to: [destino],
        subject: "Tu código para entrar a IDEA",
        html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#F3EFE4;padding:24px;color:#16150F">
          <p style="font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#E2401C;margin:0 0 8px">IDEA · ICFES</p>
          <h1 style="font-size:22px;margin:0 0 8px">Recupera tu contraseña</h1>
          <p style="margin:0 0 16px">Escribe este código en la app. Vale por 30 minutos.</p>
          <p style="font-family:ui-monospace,monospace;font-size:30px;letter-spacing:.18em;background:#FBF9F3;border:2px solid #16150F;padding:12px 16px;display:inline-block">${codigo}</p>
          <p style="margin:16px 0 0;font-size:13px;color:#6B675A">Si no lo pediste, ignora este correo.</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
