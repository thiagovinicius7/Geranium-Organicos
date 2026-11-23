import { Fragment, useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import SobraLoja from "./SobraLoja";

// Link fixo da Bioloja (#/loja/<token>): abre sempre a sobra mais recente.
// O script do quadro aponta lojas/<token> para cada formulário novo. A tela
// acompanha o apontamento ao vivo e confere de novo sempre que o celular
// volta para a aba, para nunca mostrar uma lista antiga.

export default function LojaFixa({ token }: { token: string }) {
  const [sobraId, setSobraId] = useState<string | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "naoEncontrado" | "erro">("carregando");

  async function carregar() {
    try {
      const snap = await getDoc(doc(db, "lojas", token));
      const id = snap.exists() ? snap.data().sobraId : null;
      if (typeof id === "string" && id) { setSobraId(id); setEstado("ok"); }
      else setEstado("naoEncontrado");
    } catch (e) {
      console.error(e);
      setEstado("erro");
    }
  }

  useEffect(() => {
    carregar();
    const pare = onSnapshot(doc(db, "lojas", token), snap => {
      const id = snap.exists() ? snap.data().sobraId : null;
      if (typeof id === "string" && id) { setSobraId(id); setEstado("ok"); }
    }, e => console.error(e));
    const aoVoltar = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("pageshow", aoVoltar);
    return () => {
      pare();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("pageshow", aoVoltar);
    };
  }, [token]);

  // A chave troca a tela inteira quando chega uma lista nova.
  if (sobraId && estado !== "naoEncontrado") return <Fragment key={sobraId}><SobraLoja id={sobraId} fixo={token} /></Fragment>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans max-w-xl mx-auto">
      <header className="bg-emerald-700 text-white px-5 pt-6 pb-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-emerald-100">Sítio Geranium · Bioloja</p>
        <h1 className="text-2xl font-extrabold mt-1">Sobra da feira</h1>
      </header>
      <div className="p-6 space-y-4">
        <p className="text-lg text-slate-800">
          {estado === "carregando" ? "Carregando…"
            : estado === "erro" ? "Não foi possível abrir. Confira a internet."
            : "Este link não está valendo. Peça o link novo ao Thiago."}
        </p>
        {estado === "erro" && (
          <button onClick={carregar} className="w-full rounded-xl bg-emerald-700 text-white text-lg font-bold py-4">Tentar de novo</button>
        )}
      </div>
    </div>
  );
}
