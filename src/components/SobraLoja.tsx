import { useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  SobraItem, SobraResposta, dataFeiraExtensa, lerNumero, totalNaLoja, agruparItens,
} from "../lib/sobra";

// Formulário de sobra da Bioloja. Abre pelo link do WhatsApp, sem login:
// a lista vem pronta do quadro de colheita e a loja só digita os números.

type Estado = "carregando" | "naoEncontrado" | "erro" | "aberto" | "enviado" | "conferido";

interface Linha { sobrou: string; perdeu: string }

const chaveRascunho = (id: string) => `sobra-rascunho-${id}`;

function lerRascunho(id: string): { linhas?: Linha[]; quem?: string; obs?: string } | null {
  try {
    const t = localStorage.getItem(chaveRascunho(id));
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

function salvarRascunho(id: string, dados: { linhas: Linha[]; quem: string; obs: string }) {
  try { localStorage.setItem(chaveRascunho(id), JSON.stringify(dados)); } catch { /* sem armazenamento */ }
}

function apagarRascunho(id: string) {
  try { localStorage.removeItem(chaveRascunho(id)); } catch { /* sem armazenamento */ }
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// fixo: token do link fixo da loja, quando a tela foi aberta por ele.
export default function SobraLoja({ id, fixo }: { id: string; fixo?: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [feira, setFeira] = useState("");
  const [itens, setItens] = useState<SobraItem[]>([]);
  const [previsto, setPrevisto] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [quem, setQuem] = useState("");
  const [obs, setObs] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  async function carregar() {
    setEstado("carregando");
    try {
      const snap = await getDoc(doc(db, "sobras", id));
      if (!snap.exists()) { setEstado("naoEncontrado"); return; }
      const d = snap.data();
      const lista: SobraItem[] = d.itens || [];
      setFeira(d.feira || "");
      setItens(lista);
      setPrevisto(!!d.previsto);
      const respostas: SobraResposta[] = d.respostas || [];
      const rascunho = lerRascunho(id);
      const base: Linha[] = lista.map((_, i) => ({
        sobrou: respostas[i] ? String(respostas[i].sobrou).replace(".", ",") : "",
        perdeu: respostas[i] ? String(respostas[i].perdeu).replace(".", ",") : "",
      }));
      const usarRascunho = rascunho?.linhas && rascunho.linhas.length === lista.length && d.status === "aberta";
      setLinhas(usarRascunho ? rascunho!.linhas! : base);
      setQuem((usarRascunho ? rascunho?.quem : null) ?? d.quemContou ?? "");
      setObs((usarRascunho ? rascunho?.obs : null) ?? d.obs ?? "");
      setEstado(d.status === "conferida" ? "conferido" : d.status === "enviada" ? "enviado" : "aberto");
    } catch (e) {
      console.error(e);
      setEstado("erro");
    }
  }

  useEffect(() => { carregar(); }, [id]);

  useEffect(() => {
    if (estado === "aberto" && linhas.length) salvarRascunho(id, { linhas, quem, obs });
  }, [linhas, quem, obs, estado]);

  const grupos = useMemo(() => agruparItens(itens), [itens]);

  const problemas = useMemo(() => itens.map((it, i) => {
    const l = linhas[i];
    if (!l) return "";
    const s = lerNumero(l.sobrou);
    const p = l.perdeu.trim() === "" ? 0 : lerNumero(l.perdeu);
    if (l.sobrou.trim() === "") return "Escreva quanto sobrou (0 se não sobrou nada).";
    if (s === null || s < 0) return "Número inválido em Sobrou.";
    if (p === null || p < 0) return "Número inválido em Perdeu.";
    return "";
  }), [itens, linhas]);

  const avisos = useMemo(() => itens.map((it, i) => {
    const l = linhas[i];
    if (!l) return "";
    const s = lerNumero(l.sobrou) ?? 0;
    const p = l.perdeu.trim() === "" ? 0 : (lerNumero(l.perdeu) ?? 0);
    const total = totalNaLoja(it);
    // Pelo previsto, aceita o que a loja contou, sem aviso: a conta fecha com o quadro final.
    if (previsto || s + p <= total) return "";
    return `Sobrou + perdeu (${fmt(s + p)}) passa do total na loja (${fmt(total)}). Confira.`;
  }), [itens, linhas, previsto]);

  const faltando = problemas.filter(Boolean).length + (quem.trim() ? 0 : 1);

  function mudar(i: number, campo: keyof Linha, valor: string) {
    setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  async function enviar() {
    setTentouEnviar(true);
    setErroEnvio("");
    if (faltando > 0) return;
    setEnviando(true);
    try {
      if (fixo) {
        // Confere se esta ainda é a lista mais recente antes de gravar.
        const atual = await getDoc(doc(db, "lojas", fixo));
        if (atual.exists() && atual.data().sobraId !== id) {
          setErroEnvio("Chegou uma lista nova. A tela vai recarregar com a sobra certa.");
          setTimeout(() => window.location.reload(), 1500);
          return;
        }
      }
      const respostas: SobraResposta[] = linhas.map(l => ({
        sobrou: lerNumero(l.sobrou) ?? 0,
        perdeu: l.perdeu.trim() === "" ? 0 : (lerNumero(l.perdeu) ?? 0),
      }));
      await updateDoc(doc(db, "sobras", id), {
        respostas,
        quemContou: quem.trim().slice(0, 60),
        obs: obs.trim().slice(0, 500),
        enviadoEm: serverTimestamp(),
        status: "enviada",
      });
      apagarRascunho(id);
      setEstado("enviado");
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error(e);
      setErroEnvio("Não foi possível enviar. Confira a internet e toque em Enviar de novo. Se continuar, avise o Thiago.");
    } finally {
      setEnviando(false);
    }
  }

  const cabecalho = (
    <header className="bg-emerald-700 text-white px-5 pt-6 pb-5">
      <p className="text-xs font-semibold tracking-widest uppercase text-emerald-100">Sítio Geranium · Bioloja</p>
      <h1 className="text-2xl font-extrabold mt-1">Sobra da feira</h1>
      {feira && <p className="text-lg mt-0.5 text-emerald-50">{dataFeiraExtensa(feira)}</p>}
    </header>
  );

  if (estado === "carregando") {
    return <Tela>{cabecalho}<p className="p-6 text-lg text-slate-600">Carregando a lista…</p></Tela>;
  }
  if (estado === "naoEncontrado" || estado === "erro") {
    return (
      <Tela>{cabecalho}
        <div className="p-6 space-y-4">
          <p className="text-lg text-slate-800">
            {estado === "erro" ? "Não foi possível abrir a lista. Confira a internet." : "Este link não está valendo. Peça o link novo ao Thiago."}
          </p>
          {estado === "erro" && <button onClick={carregar} className="w-full rounded-xl bg-emerald-700 text-white text-lg font-bold py-4">Tentar de novo</button>}
        </div>
      </Tela>
    );
  }
  if (estado === "enviado" || estado === "conferido") {
    return (
      <Tela>{cabecalho}
        <div className="p-6 space-y-4">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
            <p className="text-2xl font-extrabold text-emerald-800">{estado === "conferido" ? "Sobra conferida" : "Enviado. Obrigado!"}</p>
            <p className="text-base text-emerald-900 mt-2">
              {estado === "conferido"
                ? "Esta sobra já foi conferida e não pode mais ser alterada."
                : `Contagem de ${quem || "—"} recebida.`}
            </p>
            {fixo && (
              <p className="text-base text-emerald-900 mt-2">
                Quando chegar o próximo quadro de colheita, a lista nova aparece aqui neste mesmo link.
              </p>
            )}
          </div>
          {fixo && (
            <button onClick={() => window.location.reload()} className="w-full rounded-xl bg-emerald-700 text-white text-lg font-bold py-4">
              Ver se já chegou a lista nova
            </button>
          )}
          {estado === "enviado" && (
            <button onClick={() => setEstado("aberto")} className="w-full rounded-xl border-2 border-emerald-700 text-emerald-800 text-lg font-bold py-4">
              Corrigir algum número
            </button>
          )}
        </div>
      </Tela>
    );
  }

  return (
    <Tela>
      {cabecalho}
      <div className="px-4 py-4 space-y-2 text-base text-slate-700 bg-emerald-50 border-b border-emerald-100">
        <p>No fim da feira, conte o que sobrou de cada produto.</p>
        <p><b>Sobrou</b> = está bom. <b>Perdeu</b> = foi para o lixo ou para a desidratação (escreva na observação para onde foi). Se não sobrou nada, escreva <b>0</b>.</p>
      </div>
      {previsto && (
        <div className="mx-3 mt-3 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-base text-orange-900">
          As quantidades de <b>Chegou</b> são as <b>previstas</b> no quadro. Conte a sobra normalmente. Se chegou e sobrou <b>mais</b> do que o previsto, escreva o número de verdade: o que chegou de verdade entra depois, com o quadro final.
        </div>
      )}

      <main className="px-3 py-4 space-y-6">
        {grupos.map(g => (
          <section key={g.titulo}>
            <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-emerald-800">{g.titulo}</h2>
            <p className="px-1 text-sm text-slate-500 mb-2">{g.nota}</p>
            <div className="space-y-3">
              {g.indices.map(i => {
                const it = itens[i];
                const l = linhas[i] || { sobrou: "", perdeu: "" };
                const erro = tentouEnviar ? problemas[i] : "";
                return (
                  <div key={i} className={`rounded-2xl bg-white border p-4 shadow-sm ${erro ? "border-red-500" : "border-slate-200"}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-lg font-bold text-slate-900 leading-tight">{it.cultura}</p>
                      <p className="text-sm font-semibold text-slate-500 shrink-0">{it.rotulo}</p>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      {it.anterior > 0 && <>Ficou da feira anterior: <b>{fmt(it.anterior)}</b> · </>}
                      {previsto ? "Previsto" : "Chegou"}: <b>{it.colhido > 0 ? fmt(it.colhido) : "—"}</b>
                      {it.anterior > 0 && <> · Total: <b>{fmt(totalNaLoja(it))}</b></>}
                    </p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <label className="block">
                        <span className="block text-sm font-semibold text-slate-700 mb-1">Sobrou</span>
                        <input
                          inputMode="decimal" autoComplete="off" value={l.sobrou}
                          onChange={e => mudar(i, "sobrou", e.target.value)}
                          aria-label={`${it.cultura}: quanto sobrou, em ${it.rotulo}`}
                          className="w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-2xl font-bold text-center focus:border-emerald-600 outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-semibold text-slate-700 mb-1">Perdeu</span>
                        <input
                          inputMode="decimal" autoComplete="off" value={l.perdeu} placeholder="0"
                          onChange={e => mudar(i, "perdeu", e.target.value)}
                          aria-label={`${it.cultura}: quanto perdeu, em ${it.rotulo}`}
                          className="w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-2xl font-bold text-center focus:border-emerald-600 outline-none placeholder:text-slate-300"
                        />
                      </label>
                    </div>
                    {erro && <p className="text-sm font-semibold text-red-700 mt-2">{erro}</p>}
                    {!erro && avisos[i] && <p className="text-sm font-semibold text-amber-800 mt-2">{avisos[i]}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-4">
          <label className="block">
            <span className="block text-base font-bold text-slate-800 mb-1">Quem contou</span>
            <input
              value={quem} onChange={e => setQuem(e.target.value)} maxLength={60} autoComplete="name"
              className={`w-full rounded-xl border-2 px-3 py-3 text-lg outline-none focus:border-emerald-600 ${tentouEnviar && !quem.trim() ? "border-red-500" : "border-slate-300"}`}
            />
            {tentouEnviar && !quem.trim() && <span className="block text-sm font-semibold text-red-700 mt-1">Escreva seu nome.</span>}
          </label>
          <label className="block">
            <span className="block text-base font-bold text-slate-800 mb-1">Observação (opcional)</span>
            <textarea
              value={obs} onChange={e => setObs(e.target.value)} maxLength={500} rows={3}
              placeholder="Ex.: 59 kg de banana da perda foram para a desidratação"
              className="w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
            />
          </label>
        </section>

        {tentouEnviar && faltando > 0 && (
          <p className="text-base font-semibold text-red-700 px-1">Falta preencher {faltando} {faltando === 1 ? "campo" : "campos"} (marcados em vermelho).</p>
        )}
        {erroEnvio && <p className="text-base font-semibold text-red-700 px-1">{erroEnvio}</p>}

        <button
          onClick={enviar} disabled={enviando}
          className="w-full rounded-2xl bg-emerald-700 text-white text-xl font-extrabold py-5 shadow disabled:opacity-60"
        >
          {enviando ? "Enviando…" : "Enviar sobra"}
        </button>
        <p className="text-sm text-slate-500 text-center pb-8">O que você digitar fica guardado neste celular até enviar.</p>
      </main>
    </Tela>
  );
}

function Tela({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 font-sans max-w-xl mx-auto">{children}</div>;
}
