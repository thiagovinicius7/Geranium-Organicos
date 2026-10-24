import { collection, getDocs, writeBatch, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Crop } from "../types";

export const DEFAULT_CROPS: Crop[] = [
  { nome: "Abacate", cientifico: "Persea americana", dias: 0, duracao: 0, unidadeColheita: "KG" },
  { nome: "Abóbora itália", cientifico: "Cucurbita pepo", dias: 35, duracao: 40, unidadeColheita: "KG" },
  { nome: "Abóbora menina", cientifico: "Cucurbita moschata", dias: 90, duracao: 30, unidadeColheita: "KG" },
  { nome: "Açafrão", cientifico: "Curcuma longa", dias: 240, duracao: 60, unidadeColheita: "KG" },
  { nome: "Acelga", cientifico: "Beta vulgaris var. cicla", dias: 60, duracao: 50, unidadeColheita: "MÇ" },
  { nome: "Agrião", cientifico: "Nasturtium officinale", dias: 35, duracao: 25, unidadeColheita: "MÇ" },
  { nome: "Agrião da terra", cientifico: "Barbarea verna", dias: 40, duracao: 30, unidadeColheita: "MÇ" },
  { nome: "Alface Americana", cientifico: "Lactuca sativa var. capitata", dias: 35, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alface Crespa roxa", cientifico: "Lactuca sativa var. crispa", dias: 35, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alface Crespa verde", cientifico: "Lactuca sativa var. crispa", dias: 35, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alface Lisa", cientifico: "Lactuca sativa", dias: 35, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alface Mimosa roxa", cientifico: "Lactuca sativa", dias: 45, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alface Mimosa verde", cientifico: "Lactuca sativa", dias: 45, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alface Romana", cientifico: "Lactuca sativa var. longifolia", dias: 35, duracao: 30, unidadeColheita: "UN" },
  { nome: "Alho-porró", cientifico: "Allium ampeloprasum", dias: 60, duracao: 45, unidadeColheita: "UN" },
  { nome: "Almeirão", cientifico: "Cichorium intybus", dias: 60, duracao: 40, unidadeColheita: "MÇ" },
  { nome: "Beterraba", cientifico: "Beta vulgaris L.", dias: 75, duracao: 30, unidadeColheita: "MÇ" },
  { nome: "Brócolis Japonês", cientifico: "Brassica oleracea var. italica", dias: 75, duracao: 40, unidadeColheita: "KG" },
  { nome: "Brócolis ramoso", cientifico: "Brassica oleracea var. italica", dias: 60, duracao: 50, unidadeColheita: "MÇ" },
  { nome: "Cebolinha", cientifico: "Allium fistulosum", dias: 60, duracao: 90, unidadeColheita: "MÇ" },
  { nome: "Cenoura", cientifico: "Daucus carota", dias: 90, duracao: 30, unidadeColheita: "KG" },
  { nome: "Chicória", cientifico: "Cichorium intybus", dias: 50, duracao: 35, unidadeColheita: "MÇ" },
  { nome: "Coentro", cientifico: "Coriandrum sativum", dias: 30, duracao: 20, unidadeColheita: "MÇ" },
  { nome: "Couve", cientifico: "Brassica oleracea var. acephala", dias: 60, duracao: 120, unidadeColheita: "MÇ" },
  { nome: "Couve crespa", cientifico: "Brassica oleracea var. sabellica", dias: 60, duracao: 100, unidadeColheita: "MÇ" },
  { nome: "Rabanete", cientifico: "Raphanus sativus", dias: 25, duracao: 15, unidadeColheita: "MÇ" },
  { nome: "Rúcula", cientifico: "Eruca sativa", dias: 35, duracao: 25, unidadeColheita: "MÇ" },
  { nome: "Salsa", cientifico: "Petroselinum crispum", dias: 60, duracao: 100, unidadeColheita: "MÇ" },
  { nome: "Tomate Lili", cientifico: "Solanum lycopersicum", dias: 100, duracao: 90, unidadeColheita: "KG" },
];

export async function seedDatabaseIfEmpty() {
  try {
    const cropsCol = collection(db, "crops");
    const snapshot = await getDocs(cropsCol);
    
    if (snapshot.empty) {
      console.log("Seeding crops database with default organic cultures...");
      const batch = writeBatch(db);
      DEFAULT_CROPS.forEach((crop) => {
        const docRef = doc(cropsCol);
        batch.set(docRef, crop);
      });
      await batch.commit();
      console.log("Crops seeding completed!");
    }

    const metadataCol = collection(db, "metadata");
    const metaSnapshot = await getDocs(metadataCol);
    if (metaSnapshot.empty) {
      console.log("Seeding system metadata/certifications...");
      await setDoc(doc(metadataCol, "geranium"), {
        seloValidade: "2026-04-03",
        seloVisita: "2025-12-12",
        seloCertificadora: "IBD Certificações",
        seloNumero: "IBD-ORG-0842"
      });
      console.log("Metadata seeding completed!");
    }

    const licensesCol = collection(db, "licenses");
    const licensesSnapshot = await getDocs(licensesCol);
    if (licensesSnapshot.empty) {
      console.log("Seeding default compliance licenses...");
      const batch = writeBatch(db);
      
      const defaultLicenses = [
        {
          titulo: "Selo Orgânico Certificado",
          orgaoEmissor: "IBD Certificações",
          numeroRegistro: "IBD-ORG-0842",
          tipo: "Selo Orgânico",
          dataEmissao: "2025-12-12",
          dataValidade: "2026-04-03",
          responsavel: "Auditoria Anual IBD",
          observacoes: "Certificação da produção vegetal orgânica em conformidade com as diretrizes do MAPA.",
          ativo: true
        },
        {
          titulo: "Outorga de Direito de Uso da Água",
          orgaoEmissor: "ADASA / ANA",
          numeroRegistro: "ADASA-OUT-2024/09",
          tipo: "Outorga de Água",
          dataEmissao: "2024-06-15",
          dataValidade: "2027-06-15",
          responsavel: "Engenharia Agronômica",
          observacoes: "Captação de água subterrânea (Poço Tubular) para irrigação e higienização de canteiros.",
          ativo: true
        },
        {
          titulo: "Cadastro Ambiental Rural (CAR)",
          orgaoEmissor: "SICAR / IBRAM-DF",
          numeroRegistro: "DF-5300108-CAR-01",
          tipo: "CAR",
          dataEmissao: "2023-01-10",
          dataValidade: "2028-12-31",
          responsavel: "Gestão Ambiental",
          observacoes: "Registro obrigatório do imóvel rural e áreas de preservação permanente.",
          ativo: true
        }
      ];

      defaultLicenses.forEach(lic => {
        const newDoc = doc(licensesCol);
        batch.set(newDoc, lic);
      });

      await batch.commit();
      console.log("Licenses seeding completed!");
    }

    // Seed authorized emails if not present
    const authEmailsCol = collection(db, "authorized_emails");
    const authEmailsSnapshot = await getDocs(authEmailsCol);
    if (authEmailsSnapshot.empty) {
      console.log("Seeding authorized admin emails...");
      const admins = ["thiagovinicius7@gmail.com"];
      for (const mail of admins) {
        const id = mail.replace(/[^a-zA-Z0-9_.]/g, "_");
        await setDoc(doc(authEmailsCol, id), {
          email: mail,
          addedBy: "Sistema (Administrador Inicial)",
          addedAt: new Date().toISOString(),
          role: "admin"
        });
      }
      console.log("Authorized emails seeding completed!");
    }
  } catch (error) {
    console.error("Error during database seeding:", error);
  }
}
