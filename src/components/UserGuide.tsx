import React, { useState } from "react";
import { 
  BookOpen, 
  Leaf, 
  ShoppingCart, 
  Sprout, 
  Droplets, 
  Search, 
  FileSpreadsheet, 
  HelpCircle, 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Printer, 
  ArrowRight,
  Database,
  Calendar,
  Layers,
  FileText
} from "lucide-react";

interface GuideSection {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  subtitle: string;
  content: React.ReactNode;
}

export default function UserGuide() {
  const [activeSection, setActiveSection] = useState<string>("intro");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const sections: GuideSection[] = [
    {
      id: "intro",
      title: "Visão Geral do Sistema",
      icon: BookOpen,
      subtitle: "Introdução ao Gestão Orgânicos Geranium",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            O sistema <strong>Gestão Orgânicos Geranium v2.1</strong> é uma plataforma completa e integrada para planejamento, rastreamento e auditoria de hortaliças e culturas orgânicas. Ele foi desenvolvido para unificar o estoque de insumos (sementes e mudas), os plantios em campo, as adubações, as colheitas diárias e a emissão automática de códigos de rastreabilidade (<strong>"Da Semente ao Prato"</strong>).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex gap-3 items-start">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Controle Completo de Ciclo</h4>
                <p className="text-xs text-slate-600 mt-1">Acompanhe desde a aquisição das sementes até a entrega final ao cliente com atualização automática de saldos de estoque.</p>
              </div>
            </div>
            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex gap-3 items-start">
              <Search className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Rastreabilidade Legítima</h4>
                <p className="text-xs text-slate-600 mt-1">Busca instantânea e emissão de ficha técnica para auditorias sanitárias ou de certificação orgânica.</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-500" /> Fluxo de Dados Recomendado
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Para obter o máximo de precisão na rastreabilidade, siga esta sequência lógica de cadastros no dia a dia:
            </p>
            <ol className="space-y-3">
              <li className="flex gap-3 items-start">
                <span className="w-5 h-5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center justify-center shrink-0">1</span>
                <div>
                  <strong className="text-xs text-slate-800 block">Cadastrar Culturas</strong>
                  <span className="text-xs text-slate-500">Defina os parâmetros padrão de ciclo de crescimento de cada variedade (ex: Alface crespa verde).</span>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-5 h-5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center justify-center shrink-0">2</span>
                <div>
                  <strong className="text-xs text-slate-800 block">Registrar Compras & Estoque de Sementes/Mudas</strong>
                  <span className="text-xs text-slate-800">Crie os lotes de entrada associando a fornecedores, NF e quantidade adquirida.</span>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-5 h-5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center justify-center shrink-0">3</span>
                <div>
                  <strong className="text-xs text-slate-800 block">Lançar Plantios no Campo</strong>
                  <span className="text-xs text-slate-800">Registre o plantio do canteiro. Vincule-o ao lote de estoque de mudas correspondente para rastrear a origem genética.</span>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-5 h-5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center justify-center shrink-0">4</span>
                <div>
                  <strong className="text-xs text-slate-800 block">Registrar Colheitas</strong>
                  <span className="text-xs text-slate-800">Conforme a planta cresce e atinge o ponto ideal, lance as quantidades colhidas e agrupe em sessões de venda.</span>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: "crops",
      title: "1. Variedades & Culturas",
      icon: Leaf,
      subtitle: "Cadastro do portfólio botânico",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            A aba de <strong>Culturas</strong> funciona como a biblioteca botânica da fazenda. Nela, você cadastra as espécies e variedades que produz. Esses dados são fundamentais para que o sistema possa prever as datas de colheita e estimar os períodos produtivos de cada canteiro.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <h4 className="font-extrabold text-slate-900 text-sm">Campos Principais:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="font-bold text-xs text-slate-800 block">Nome Comum</span>
                <span className="text-xs text-slate-500">Nome identificável no mercado comercial (ex: <em>Alface Crespa Roxa</em>).</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="font-bold text-xs text-slate-800 block">Nome Científico</span>
                <span className="text-xs text-slate-500">Nomenclatura taxonômica botânica (ex: <em>Lactuca sativa var. crispa</em>).</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="font-bold text-xs text-slate-800 block">Dias Estimados</span>
                <span className="text-xs text-slate-500">O tempo de ciclo (em dias) que a planta leva desde o dia do plantio até o início da colheita (ex: 45 dias).</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="font-bold text-xs text-slate-800 block">Período Colhendo</span>
                <span className="text-xs text-slate-500">A janela temporal ativa de colheita (em dias) antes da cultura esgotar ou sofrer senescência (ex: 20 dias).</span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200 flex gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 leading-relaxed">
              <strong>Dica Prática:</strong> Manter esses valores atualizados ajuda a refinar a estimativa do Painel Geral, mostrando avisos precisos de plantios que entraram ou estão prestes a entrar em período de colheita.
            </div>
          </div>
        </div>
      )
    },
    {
      id: "purchases",
      title: "2. Compras & Estoque de Lotes",
      icon: ShoppingCart,
      subtitle: "Gestão do estoque de sementes e mudas",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            Para garantir a rastreabilidade orgânica, cada semente ou muda inserida no solo precisa de uma origem comprovada. Na aba de <strong>Compras & Estoque</strong>, você registra as entradas de insumos.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <h4 className="font-extrabold text-slate-900 text-sm">Estrutura de Rastreamento de Lote:</h4>
            <ul className="space-y-3 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span><strong>Identificador do Lote (Código):</strong> Gerado automaticamente (ou inserido manualmente) para identificar de forma única cada compra.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span><strong>Tipo (Semente ou Muda):</strong> Diferencia o tipo de insumo e dita comportamentos do plantio.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span><strong>Fornecedor e Nota Fiscal (NF):</strong> Informação crucial exigida por certificadoras de orgânicos.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span><strong>Saldo do Lote:</strong> O sistema debita do saldo desse lote de insumos sempre que você registra um novo plantio que faça menção a ele!</span>
              </li>
            </ul>
          </div>

          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200 flex gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-800 leading-relaxed">
              <strong>Como Funciona o Vínculo:</strong> Quando um lote de sementeira/compra chega a <strong>0 unidades</strong> de saldo, ele é automaticamente classificado como <strong>"Esgotado"</strong>. Lotes ativos continuam disponíveis para novos lançamentos de plantio.
            </div>
          </div>
        </div>
      )
    },
    {
      id: "plantings",
      title: "3. Plantio / Canteiros Ativos",
      icon: Sprout,
      subtitle: "Acompanhamento e evolução no campo",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            A aba de <strong>Plantio / Campo</strong> representa a vida diária nas áreas cultivadas. Nela, você lança os plantios, as variedades utilizadas, os talhões e canteiros onde foram alocadas e o tipo de adubo utilizado.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status de Evolução do Plantio</span>
              <ul className="space-y-2 text-xs">
                <li className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="font-bold text-slate-700">🌱 No campo</span>
                  <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold uppercase">Crescimento</span>
                </li>
                <li className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="font-bold text-slate-700">✅ Pronto para colher</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold uppercase">Da previsão até 14 dias</span>
                </li>
                <li className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="font-bold text-slate-700">⚠️ Colheita atrasada</span>
                  <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold uppercase">15+ dias da previsão</span>
                </li>
                <li className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="font-bold text-slate-700">🍓 Em colheita</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold uppercase">Ativo</span>
                </li>
                <li className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="font-bold text-slate-700">✅ Finalizado</span>
                  <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full font-bold uppercase">Concluído</span>
                </li>
              </ul>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cálculo de Previsão de Colheita</span>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  O sistema calcula automaticamente a <strong>Data de Previsão</strong> adicionando os dias estimados de ciclo da cultura à data de início do plantio.
                </p>
                <div className="mt-2 text-xs p-2.5 bg-emerald-50 rounded-xl border border-emerald-100/50 font-mono text-emerald-800 text-center">
                  Previsão = Data Plantio + Ciclo Cultura
                </div>
                <div className="mt-2 text-xs p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-mono text-slate-700 text-center">
                  Colher até = Previsão + Duração da colheita
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Você pode ajustar livremente essa data ao salvar se notar variações climáticas.
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-200/50 space-y-2">
            <h4 className="font-bold text-xs text-indigo-900 flex items-center gap-1.5">
              <Database className="w-4 h-4" /> Integração com Estoque (ID Lote)
            </h4>
            <p className="text-xs text-indigo-800 leading-relaxed">
              Ao criar um plantio, utilize o campo <strong>Código do Lote</strong>. O sistema listará os lotes de sementes/mudas ativos para que você escolha qual lote compôs o plantio corrente. Isso desconta a quantidade plantada do saldo do lote e estabelece o vínculo de rastreabilidade.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "harvests",
      title: "4. Colheitas Diárias",
      icon: Droplets,
      subtitle: "Registro de produtos retirados do campo",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            Sempre que houver despesca, colheita ou corte nos canteiros, utilize a aba de <strong>Colheita Diária</strong>. Registrar as colheitas corretamente vincula a produção final ao lote de terra e à semente original.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <h4 className="font-extrabold text-slate-900 text-sm">Fórmula de Sucesso na Colheita:</h4>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <ArrowRight className="w-4 h-4 text-emerald-600 mt-1 shrink-0" />
                <p className="text-xs text-slate-600">
                  <strong>ID do Plantio:</strong> Digite ou selecione o código do plantio correspondente (ex: <code>PLAN-2601-XYZ</code>) para indicar exatamente qual canteiro foi colhido.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <ArrowRight className="w-4 h-4 text-emerald-600 mt-1 shrink-0" />
                <p className="text-xs text-slate-600">
                  <strong>Quantidade Colhida:</strong> Registre a quantidade exata de maços, unidades ou quilogramas retirados.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <ArrowRight className="w-4 h-4 text-emerald-600 mt-1 shrink-0" />
                <p className="text-xs text-slate-600">
                  <strong>ID da Sessão:</strong> Útil para consolidar várias colheitas em um único pedido, carregamento ou lote de expedição do dia (ex: <code>SESS-2607-01</code>).
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
            <h5 className="font-bold text-slate-800 text-xs mb-1">Ações Automáticas:</h5>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ao efetuar a colheita, o status do plantio correspondente é alterado dinamicamente para <strong>"Colhendo"</strong>, indicando que o canteiro está gerando receita ativa.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "traceability",
      title: "5. Rastreabilidade \"Da Semente ao Prato\"",
      icon: Search,
      subtitle: "Auditoria instantânea e transparência",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            Esta é a engrenagem principal exigida para certificação orgânica e transparência comercial. Na aba de <strong>Rastreabilidade</strong>, você insere o código do plantio (ou seleciona um plantio histórico) para analisar todo o histórico retrospectivo da cultura.
          </p>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider text-slate-500">O que o relatório revela:</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="font-extrabold text-[10px] text-emerald-600 block uppercase mb-1">Passo 1: Origem</span>
                <p className="text-xs text-slate-700 font-medium">Lote de compra, fornecedor, tipo do insumo e Nota Fiscal (NF) que deu origem à semente.</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="font-extrabold text-[10px] text-indigo-600 block uppercase mb-1">Passo 2: Condução</span>
                <p className="text-xs text-slate-700 font-medium">Data em que foi plantado, talhão e canteiro físico, quantidade inicial e tipo de adubação aplicada.</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="font-extrabold text-[10px] text-amber-600 block uppercase mb-1">Passo 3: Colheita</span>
                <p className="text-xs text-slate-700 font-medium">Histórico consolidado de todas as colheitas diárias retiradas daquele canteiro e sessões vinculadas.</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 flex gap-3 items-start">
            <Printer className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-xs text-emerald-900">Suporte para Impressão Física</h5>
              <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                Você pode clicar no botão <strong>"Imprimir Ficha Técnica"</strong> na tela de Rastreabilidade. O relatório foi formatado especificamente para ser impresso de forma limpa, ocultando botões e menus de navegação do app, gerando uma folha ideal para arquivamento ou envio ao cliente final.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "import",
      title: "6. Importador Express",
      icon: FileSpreadsheet,
      subtitle: "Como migrar suas planilhas de forma integrada",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 leading-relaxed">
            O <strong>Importador de Planilhas</strong> permite que você traga dados consolidados em massa de arquivos Excel ou Google Sheets (.xlsx, .csv). Ele foi construído com inteligência adaptativa para reduzir o retrabalho manual.
          </p>

          <div className="border border-indigo-100 bg-indigo-50/30 p-5 rounded-2xl space-y-4">
            <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4" /> 1. Inteligência de Mapeamento de Colunas
            </h4>
            <p className="text-xs text-indigo-950/80 leading-relaxed">
              Você não precisa se preocupar se suas colunas não tiverem o nome exato do banco de dados! O importador analisa sinônimos comuns em português para fazer a ligação automática dos dados:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
                <span className="font-bold text-indigo-900 block mb-0.5">Nome da Cultura</span>
                <span className="text-slate-600">Aceita: "cultura", "planta", "nome", "produto", "sementeira"</span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
                <span className="font-bold text-indigo-900 block mb-0.5">Código Identificador (ID)</span>
                <span className="text-slate-600">Aceita: "id", "codigo", "identificador", "lote", "entrada", "compra"</span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
                <span className="font-bold text-indigo-900 block mb-0.5">Nota Fiscal (NF)</span>
                <span className="text-slate-600">Aceita: "nf", "nota", "fatura", "documento", "fiscal"</span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
                <span className="font-bold text-indigo-900 block mb-0.5">Fim do Ciclo</span>
                <span className="text-slate-600">Aceita: "fim", "finaliz", "conclus", "termino", "encerr"</span>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-5 rounded-2xl space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" /> 2. Processamento com Fila de Prioridade
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ao subir um arquivo com múltiplos cadastros, o sistema aplica uma <strong>fila de prioridade</strong> automática para garantir a consistência das relações no banco de dados. Ele salvará os dados nessa ordem exata:
            </p>
            <div className="flex items-center gap-2 justify-center py-2 text-xs font-mono bg-slate-50 rounded-xl border">
              <span className="px-2 py-1 bg-emerald-100 text-emerald-900 rounded font-semibold">1º Culturas</span>
              <span className="text-slate-400">➔</span>
              <span className="px-2 py-1 bg-sky-100 text-sky-900 rounded font-semibold">2º Compras</span>
              <span className="text-slate-400">➔</span>
              <span className="px-2 py-1 bg-indigo-100 text-indigo-900 rounded font-semibold">3º Plantios</span>
              <span className="text-slate-400">➔</span>
              <span className="px-2 py-1 bg-amber-100 text-amber-900 rounded font-semibold">4º Colheitas</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Isso impede, por exemplo, que uma colheita seja salva sem que o plantio correspondente exista no banco de dados, ou que um plantio não encontre sua cultura mãe correspondente.
            </p>
          </div>

          <div className="border border-emerald-200 bg-emerald-50/30 p-5 rounded-2xl space-y-3">
            <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-emerald-700" /> 3. Tratamento para Aba "Finalizados"
            </h4>
            <p className="text-xs text-emerald-950/80 leading-relaxed">
              <strong>Como funciona a movimentação de linhas?</strong> Se em sua planilha original você move uma linha inteira de plantio para uma aba de finalizados (ex: aba nomeada como <em>"Plantios Finalizados"</em> ou <em>"Concluídos"</em>) ao colher tudo, o sistema detectará isso de forma inteligente!
            </p>
            <ul className="space-y-1.5 text-xs text-emerald-800 list-disc list-inside">
              <li>Qualquer aba com termos como <strong>"finalizado"</strong>, <strong>"concluido"</strong>, <strong>"terminado"</strong> ou <strong>"encerrado"</strong> é mapeada como uma extensão de plantios.</li>
              <li>Todas as linhas importadas dessas abas específicas recebem o status interno <strong>"Finalizado"</strong> automaticamente na gravação.</li>
              <li>A data de término informada na planilha é mapeada de forma inteligente como o fechamento do lote.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "faq",
      title: "Perguntas Frequentes (FAQ)",
      icon: HelpCircle,
      subtitle: "Dúvidas comuns sobre o uso da plataforma",
      content: (
        <div className="space-y-4">
          {[
            {
              q: "Como o saldo dos lotes de compra é atualizado?",
              a: "Sempre que você lança um novo plantio informando o ID do lote de compra correspondente, a quantidade plantada é subtraída automaticamente do saldo daquela compra. Quando o saldo de mudas/sementes atinge zero, o lote de compra muda seu status para 'Esgotado'."
            },
            {
              q: "O que acontece se eu digitar um nome de cultura que não existe no plantio?",
              a: "Para garantir a consistência, ao cadastrar um plantio com uma cultura que ainda não foi cadastrada na aba de Culturas, o sistema criará essa cultura automaticamente em segundo plano usando tempos de ciclo padrão (35 dias de ciclo e 30 dias colhendo). Você poderá editá-la posteriormente."
            },
            {
              q: "Posso acessar meus dados offline ou em múltiplos dispositivos?",
              a: "Sim. O sistema utiliza o banco de dados Firebase Firestore na nuvem. Todos os dados adicionados, editados ou importados são sincronizados instantaneamente em tempo real e estão seguros contra perdas por limpeza de cache de navegador."
            },
            {
              q: "Como posso imprimir relatórios sem que as barras de menus apareçam?",
              a: "O aplicativo possui regras de folha de estilo de impressão (CSS Print). Quando você usa o botão 'Imprimir Ficha Técnica' ou aperta Ctrl+P no seu navegador, todas as interfaces administrativas (sidebar, botões, filtros) são ocultadas automaticamente, exibindo apenas as tabelas e dados formatados."
            },
            {
              q: "O que fazer se o Importador Express acusar que colunas obrigatórias estão faltando?",
              a: "O Importador exibe uma interface de 'De / Para' onde você pode apontar manualmente qual coluna da sua planilha corresponde ao dado esperado pelo sistema. Verifique se o nome comercial no arquivo corresponde às sugestões mostradas."
            }
          ].map((item, index) => (
            <div key={index} className="border border-slate-200 bg-white rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                className="w-full p-4 text-left flex justify-between items-center hover:bg-slate-50 transition duration-150"
              >
                <span className="font-bold text-xs text-slate-900">{item.q}</span>
                {expandedFaq === index ? (
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                )}
              </button>
              {expandedFaq === index && (
                <div className="p-4 bg-slate-50/50 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      )
    }
  ];

  const currentSection = sections.find(s => s.id === activeSection) || sections[0];
  const CurrentIcon = currentSection.icon;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Upper header (Hidden during print) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs print:hidden">
        <div>
          <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">Central de Ajuda</span>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-2 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-600" /> Guia de Uso Integrado
          </h1>
          <p className="text-xs text-slate-500 mt-1">Conheça o funcionamento, as regras de negócios e recursos da sua plataforma.</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 active:scale-95 transition border border-transparent shadow-xs"
        >
          <Printer className="w-4 h-4" /> Imprimir Guia Completo
        </button>
      </div>

      {/* Main Grid Area (Side menu for interactive reading, hidden in print or laid out sequentially in print) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Navigation panel (Hidden during print) */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-4 space-y-1 shadow-xs print:hidden">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-3 mb-2">Tópicos</p>
          {sections.map(section => {
            const Icon = section.icon;
            const isSelected = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition ${
                  isSelected 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100/50 shadow-xs" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? "text-emerald-600" : "text-slate-400"}`} />
                <span className="truncate">{section.title}</span>
              </button>
            );
          })}
        </div>

        {/* Contents view (Full width in print) */}
        <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs print:border-0 print:p-0 print:shadow-none">
          
          {/* Header of Content tab */}
          <div className="border-b border-slate-100 pb-5 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CurrentIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">{currentSection.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{currentSection.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="prose prose-slate max-w-none">
            {currentSection.content}
          </div>

        </div>

      </div>

      {/* Sequential Print-Only section (Displayed only during print) */}
      <div className="hidden print:block space-y-12 text-slate-900 pt-8">
        <div className="text-center pb-8 border-b border-slate-300">
          <h1 className="text-3xl font-black uppercase">Geranium Orgânicos v2.1</h1>
          <p className="text-sm text-slate-600 mt-1">Guia de Uso Oficial da Plataforma de Produção e Rastreabilidade</p>
          <p className="text-xs text-slate-400 mt-4">Impresso em: {new Date().toLocaleDateString("pt-BR")}</p>
        </div>

        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.id} className="space-y-4 break-inside-avoid pt-6 border-t border-slate-200">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black text-slate-900">{section.title}</h2>
              </div>
              <p className="text-xs text-slate-500 italic font-medium">{section.subtitle}</p>
              <div className="text-xs space-y-4">
                {section.content}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
