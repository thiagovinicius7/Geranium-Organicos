import React from "react";
import { Crop, Planting } from "../types";
import { expectativa, fimPrevistoColheita, alemDoPrazo, formatarData } from "../lib/producao";

const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("pt-BR");

/**
 * Quanto do plantio já foi colhido, quanto falta e até quando colher.
 * Usado igual no computador e no celular.
 */
export default function ProgressoColheita({ plantio, crops, compacto = false }: { plantio: Planting; crops: Crop[]; compacto?: boolean }) {
  const e = expectativa(plantio, crops);
  const fim = fimPrevistoColheita(plantio, crops);
  const atrasado = alemDoPrazo(plantio, crops);

  return (
    <div className={`space-y-1 ${compacto ? "text-[10px]" : "text-xs"}`}>
      <div className="font-extrabold text-emerald-700 font-mono">
        {fmt(e.colhido)}
        {e.esperado !== null && <span className="text-slate-400 font-semibold"> / {fmt(e.esperado)}</span>} {e.unidade}
      </div>
      {e.esperado !== null ? (
        <>
          <div className="h-1.5 w-full min-w-[80px] bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${e.percentual === 100 ? "bg-slate-400" : "bg-emerald-500"}`}
              style={{ width: `${e.percentual || 0}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 font-semibold">
            {e.falta && e.falta > 0 ? `Falta ${fmt(e.falta)} ${e.unidade}` : "Tudo colhido"}
            {!e.bloqueia && " (estimativa)"}
          </div>
        </>
      ) : (
        <div className="text-[10px] text-slate-400">Sem estimativa de colheita</div>
      )}
      {fim && (
        <div className={`text-[10px] font-semibold ${atrasado ? "text-rose-600" : "text-slate-400"}`}>
          {atrasado ? "⏰ Além do prazo — " : ""}colher até {formatarData(fim)}
        </div>
      )}
    </div>
  );
}
