export interface Crop {
  id?: string;
  nome: string;
  cientifico: string;
  dias: number;
  duracao: number;
  unidadeColheita?: string; // e.g. "kg", "UN", "MÇ", "BJ", "PCT", "CX"
}

export interface Purchase {
  id: string; // e.g., COMP-YYMMDD-RAND
  docId?: string; // Firestore document ID
  data: string; // YYYY-MM-DD
  fornecedor: string;
  nf: string;
  tipo: "Muda" | "Semente";
  cultura: string;
  quantidade: number;
  saldo: number;
  status: "Ativo" | "Esgotado" | string;
  motivoZerar?: string;
  // Quem lançou e quando (lançamentos novos)
  criadoPor?: string;
  criadoPorEmail?: string;
  criadoEm?: any;
}

export interface Planting {
  id: string; // e.g., PLAN-YYMMDD-RAND
  docId?: string; // Firestore document ID
  idLote: string; // purchase id
  data: string; // YYYY-MM-DD
  cultura: string;
  tipo: "Muda" | "Semente" | "Perene";
  talhao: string;
  quantidade: number;
  previsao: string; // estimated first harvest YYYY-MM-DD or DD/MM/YYYY
  status: "No campo" | "Esperando colheita" | "Colhendo" | "Finalizado" | string;
  totalColhido: number;
  unidade: string; // "Unidades" or "m²"
  aduboQt?: number;
  aduboComp?: string;
  dataFim?: string | null;
  perdas?: number;
  obs?: string;
  displayInSitio?: boolean;
  /** Estimativa de colheita (kg, maço…) quando não dá para contar por unidade. */
  estimativaColheita?: number;
  // Quem lançou e quando (lançamentos novos)
  criadoPor?: string;
  criadoPorEmail?: string;
  criadoEm?: any;
}

export interface Harvest {
  id?: string;
  idSessao: string;
  idPlantio: string;
  data: string; // YYYY-MM-DD
  cultura: string;
  talhao: string;
  qtd: number;
  unidade?: string;
  idLote?: string; // compra de origem, copiada do plantio
  // Quem lançou e quando (lançamentos novos)
  criadoPor?: string;
  criadoPorEmail?: string;
  criadoEm?: any;
}

export interface WeatherDay {
  data: string; // DD/MM
  max: number;
  min: number;
  chuvaProb: number;
  chuvaMm: number;
}

export interface SystemMetadata {
  id?: string;
  seloValidade: string;
  seloVisita: string;
  seloCertificadora?: string;
  seloNumero?: string;
}

export type LicenseType = 
  | "Selo Orgânico" 
  | "Outorga de Água" 
  | "Licença Ambiental" 
  | "Alvará" 
  | "Laudo Técnico" 
  | "CAR" 
  | "Outro";

export interface LicenseRecord {
  id?: string;
  docId?: string;
  titulo: string; // e.g., "Selo Orgânico IBD", "Outorga de Água - Poço 01"
  orgaoEmissor: string; // e.g., "IBD Certificações", "ADASA / ANA", "IBRAM"
  numeroRegistro?: string; // e.g., "IBD-ORG-0842", "OUT-DF-2024/09"
  tipo: LicenseType;
  dataEmissao?: string; // YYYY-MM-DD (Última auditoria / emissão)
  dataValidade: string; // YYYY-MM-DD (Data de renovação / vencimento)
  responsavel?: string; // Responsável técnico ou contato
  observacoes?: string;
  ativo?: boolean;
}
