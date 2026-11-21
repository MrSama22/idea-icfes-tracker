import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, KeyRound, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import { auth, useAuth } from "../lib/auth";
import { cn } from "../lib/utils";

type Modo = "entrar" | "registro" | "olvide" | "restablecer";

const TITULO: Record<Modo, string> = {
  entrar: "Entra a tu cuenta",
  registro: "Crea tu cuenta",
  olvide: "Olvidé mi contraseña",
  restablecer: "Escribe el código",
};

export default function EntrarPage() {
  const { cuenta } = useAuth();
  const [, nav] = useLocation();
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cambiar = (m: Modo) => {
    setModo(m);
    setError(null);
    setAviso(null);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      if (modo === "entrar") {
        await auth.entrar(email, clave);
        nav("/cartillas");
      } else if (modo === "registro") {
        await auth.registrar(email, clave, nombre);
        nav("/cartillas");
      } else if (modo === "olvide") {
        const r = await auth.olvide(email);
        setAviso(
          r.enviado
            ? "Te enviamos un código de 6 dígitos al correo. Búscalo en la bandeja de entrada o en spam."
            : "Si esa cuenta existe, el administrador puede darte una contraseña temporal desde su panel. El envío de correos todavía no está configurado.",
        );
        setModo("restablecer");
      } else {
        await auth.restablecer(email, codigo, clave);
        nav("/cartillas");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setCargando(false);
    }
  };

  if (cuenta) {
    return (
      <Shell
        right={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Inicio
          </Link>
        }
      >
        <div className="mx-auto mt-6 max-w-md rounded-xl border-2 border-foreground bg-card p-6">
          <ShieldCheck className="size-6 text-[#2E7D4F]" />
          <h1 className="mt-3 font-display text-2xl font-extrabold">Ya estás dentro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sesión iniciada como <b className="text-foreground">{cuenta.email}</b>
            {cuenta.rol === "admin" && " · administrador"}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/cartillas"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground"
            >
              Ir a mis cartillas
            </Link>
            {cuenta.rol === "admin" && (
              <Link
                to="/admin"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-foreground px-4 font-semibold"
              >
                Panel de administrador
              </Link>
            )}
            <button
              onClick={() => void auth.salir()}
              className="inline-flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-accent"
            >
              Salir
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      right={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <div className="mx-auto mt-4 max-w-md">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Tu cuenta<span className="text-accent">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Con una cuenta tus cartillas se guardan en la nube y las encuentras en cualquier dispositivo.
        </p>

        <div className="mt-5">
          <SectionTitle n="01">{TITULO[modo]}</SectionTitle>
          <form onSubmit={enviar} className="rounded-xl border-2 border-foreground bg-card p-4">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Correo</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@gmail.com"
                className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:border-foreground"
              />
            </label>

            {modo === "registro" && (
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  Nombre (opcional)
                </span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Cómo te llamas"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:border-foreground"
                />
              </label>
            )}

            {modo === "restablecer" && (
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  Código de 6 dígitos
                </span>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-lg tracking-[0.3em] outline-none focus:border-foreground"
                />
              </label>
            )}

            {modo !== "olvide" && (
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  {modo === "restablecer" ? "Nueva contraseña" : "Contraseña"}
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:border-foreground"
                />
              </label>
            )}

            {aviso && <p className="mt-3 text-sm text-muted-foreground">{aviso}</p>}
            {error && <p className="mt-3 text-sm font-medium text-accent">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {cargando ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Un momento…
                </>
              ) : modo === "entrar" ? (
                <>
                  <LogIn className="size-4" /> Entrar
                </>
              ) : modo === "registro" ? (
                <>
                  <UserPlus className="size-4" /> Crear cuenta
                </>
              ) : modo === "olvide" ? (
                <>
                  <KeyRound className="size-4" /> Enviarme un código
                </>
              ) : (
                <>
                  <KeyRound className="size-4" /> Cambiar contraseña
                </>
              )}
            </button>

            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
              <Cambio on={modo !== "entrar"} onClick={() => cambiar("entrar")}>
                Ya tengo cuenta
              </Cambio>
              <Cambio on={modo !== "registro"} onClick={() => cambiar("registro")}>
                Crear una cuenta
              </Cambio>
              <Cambio on={modo === "olvide" || modo === "restablecer"} onClick={() => cambiar("olvide")}>
                Olvidé mi contraseña
              </Cambio>
            </div>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Tu contraseña se guarda cifrada; nadie del equipo puede leerla. Si olvidaste la tuya y no llega el correo,
            pídele al administrador una contraseña temporal.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Cambio({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "underline-offset-2 hover:text-accent",
        on ? "text-foreground underline" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
