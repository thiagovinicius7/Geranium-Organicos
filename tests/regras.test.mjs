// Testes das regras do Firestore (perfis Administrador, Editor, Lançamentos).
// Para rodar (precisa de Java):
//   npm i -D firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project demo-geranium "node tests/regras.test.mjs"

import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-geranium",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

const hoursAgo = h => Timestamp.fromMillis(Date.now() - h * 3600e3);
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, "authorized_emails", "lanc_x.com"), { email: "lanc@x.com", role: "lancador" });
  await setDoc(doc(db, "authorized_emails", "ed_x.com"), { email: "ed@x.com", role: "user" });
  await setDoc(doc(db, "authorized_emails", "adm_x.com"), { email: "adm@x.com", role: "admin" });
  await setDoc(doc(db, "metadata", "auth_settings"), { isRestricted: true, allowedDomains: ["@dominio.com"] });
  await setDoc(doc(db, "metadata", "geranium"), { nome: "Sítio" });
  await setDoc(doc(db, "crops", "c1"), { nome: "Alface" });
  await setDoc(doc(db, "licenses", "l1"), { nome: "Selo" });
  await setDoc(doc(db, "plantings", "p1"), { status: "No campo", totalColhido: 0, cultura: "Alface" });
  await setDoc(doc(db, "plantings", "pfim"), { status: "Finalizado", totalColhido: 5 });
  await setDoc(doc(db, "purchases", "k1"), { status: "Ativo", saldo: 10, quantidade: 10 });
  await setDoc(doc(db, "harvests", "hmine"), { qtd: 3, criadoPor: "lanc", criadoEm: hoursAgo(1) });
  await setDoc(doc(db, "harvests", "hold"), { qtd: 3, criadoPor: "lanc", criadoEm: hoursAgo(13) });
  await setDoc(doc(db, "harvests", "hother"), { qtd: 3, criadoPor: "outro", criadoEm: hoursAgo(1) });
  await setDoc(doc(db, "harvests", "hlegacy"), { qtd: 3 });
});

const as = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const L = as("lanc", "lanc@x.com"), E = as("ed", "ed@x.com"), A = as("adm", "adm@x.com"),
      T = as("thiago", "thiagovinicius7@gmail.com"), D = as("dom", "fulano@dominio.com"),
      S = as("estranho", "estranho@gmail.com"), N = env.unauthenticatedContext().firestore();
const stamp = { criadoPor: "lanc", criadoEm: serverTimestamp() };

let pass = 0, fail = 0;
async function t(name, expectOk, fn) {
  try { await (expectOk ? assertSucceeds : assertFails)(fn()); pass++; console.log("ok   ", name); }
  catch (e) { fail++; console.log("FALHOU", name, "-", e.message.split("\n")[0]); }
}

// Lançador
await t("lanc lê culturas", true, () => getDocs(collection(L, "crops")));
await t("lanc lê colheitas", true, () => getDocs(collection(L, "harvests")));
await t("lanc NÃO altera cultura", false, () => updateDoc(doc(L, "crops", "c1"), { nome: "X" }));
await t("lanc NÃO cria cultura", false, () => addDoc(collection(L, "crops"), { nome: "X" }));
await t("lanc NÃO altera licença", false, () => updateDoc(doc(L, "licenses", "l1"), { nome: "X" }));
await t("lanc NÃO altera config", false, () => setDoc(doc(L, "metadata", "geranium"), { nome: "X" }));
await t("lanc NÃO libera e-mails", false, () => setDoc(doc(L, "authorized_emails", "z"), { email: "z@z", role: "admin" }));
await t("lanc NÃO se promove", false, () => updateDoc(doc(L, "authorized_emails", "lanc_x.com"), { role: "admin" }));
await t("lanc cria colheita", true, () => addDoc(collection(L, "harvests"), { qtd: 2, ...stamp }));
await t("lanc NÃO cria colheita sem assinatura", false, () => addDoc(collection(L, "harvests"), { qtd: 2 }));
await t("lanc NÃO cria colheita em nome de outro", false, () => addDoc(collection(L, "harvests"), { qtd: 2, criadoPor: "outro", criadoEm: serverTimestamp() }));
await t("lanc NÃO cria colheita com qtd 0", false, () => addDoc(collection(L, "harvests"), { qtd: 0, ...stamp }));
await t("lanc corrige qtd da própria colheita recente", true, () => updateDoc(doc(L, "harvests", "hmine"), { qtd: 4 }));
await t("lanc NÃO muda outro campo da colheita", false, () => updateDoc(doc(L, "harvests", "hmine"), { cultura: "X" }));
await t("lanc NÃO corrige colheita de 13h atrás", false, () => updateDoc(doc(L, "harvests", "hold"), { qtd: 4 }));
await t("lanc NÃO corrige colheita de outro", false, () => updateDoc(doc(L, "harvests", "hother"), { qtd: 4 }));
await t("lanc NÃO corrige colheita antiga sem assinatura", false, () => updateDoc(doc(L, "harvests", "hlegacy"), { qtd: 4 }));
await t("lanc NÃO apaga colheita de outro", false, () => deleteDoc(doc(L, "harvests", "hother")));
await t("lanc NÃO apaga colheita antiga", false, () => deleteDoc(doc(L, "harvests", "hold")));
await t("lanc cria plantio", true, () => addDoc(collection(L, "plantings"), { status: "No campo", totalColhido: 0, ...stamp }));
await t("lanc NÃO cria plantio já finalizado", false, () => addDoc(collection(L, "plantings"), { status: "Finalizado", totalColhido: 0, ...stamp }));
await t("lanc inicia colheita do plantio", true, () => updateDoc(doc(L, "plantings", "p1"), { status: "Colhendo" }));
await t("lanc atualiza total colhido", true, () => updateDoc(doc(L, "plantings", "p1"), { totalColhido: 7, status: "Colhendo" }));
await t("lanc NÃO finaliza plantio", false, () => updateDoc(doc(L, "plantings", "p1"), { status: "Finalizado" }));
await t("lanc NÃO edita outros campos do plantio", false, () => updateDoc(doc(L, "plantings", "p1"), { cultura: "X" }));
await t("lanc NÃO reabre plantio finalizado", false, () => updateDoc(doc(L, "plantings", "pfim"), { status: "Colhendo" }));
await t("lanc NÃO apaga plantio", false, () => deleteDoc(doc(L, "plantings", "p1")));
await t("lanc cria compra", true, () => setDoc(doc(L, "purchases", "k2"), { status: "Ativo", saldo: 5, quantidade: 5, ...stamp }));
await t("lanc NÃO cria compra com saldo inflado", false, () => setDoc(doc(L, "purchases", "k3"), { status: "Ativo", saldo: 50, quantidade: 5, ...stamp }));
await t("lanc baixa estoque", true, () => updateDoc(doc(L, "purchases", "k1"), { saldo: 8, status: "Ativo" }));
await t("lanc NÃO aumenta estoque", false, () => updateDoc(doc(L, "purchases", "k1"), { saldo: 50 }));
await t("lanc NÃO edita fornecedor", false, () => updateDoc(doc(L, "purchases", "k1"), { fornecedor: "X" }));
await t("lanc NÃO apaga compra", false, () => deleteDoc(doc(L, "purchases", "k1")));
await t("lanc grava colheita + total do plantio juntos", true, () => {
  const b = writeBatch(L);
  b.set(doc(collection(L, "harvests")), { qtd: 1, ...stamp });
  b.update(doc(L, "plantings", "p1"), { totalColhido: 8, status: "Colhendo" });
  return b.commit();
});
await t("lanc apaga a própria colheita recente", true, () => deleteDoc(doc(L, "harvests", "hmine")));

// Editor
await t("editor altera cultura", true, () => updateDoc(doc(E, "crops", "c1"), { nome: "Alface Crespa" }));
await t("editor finaliza plantio", true, () => updateDoc(doc(E, "plantings", "p1"), { status: "Finalizado" }));
await t("editor apaga colheita de outro", true, () => deleteDoc(doc(E, "harvests", "hother")));
await t("editor altera config", true, () => setDoc(doc(E, "metadata", "geranium"), { nome: "Sítio Geranium" }));
await t("editor NÃO libera e-mails", false, () => setDoc(doc(E, "authorized_emails", "z"), { email: "z@z" }));
await t("editor NÃO muda modo de acesso", false, () => setDoc(doc(E, "metadata", "auth_settings"), { isRestricted: false }));
await t("domínio liberado edita", true, () => updateDoc(doc(D, "crops", "c1"), { nome: "Y" }));

// Admin
await t("admin cadastrado libera e-mails", true, () => setDoc(doc(A, "authorized_emails", "novo_x.com"), { email: "novo@x.com", role: "lancador" }));
await t("admin permanente muda modo de acesso", true, () => setDoc(doc(T, "metadata", "auth_settings"), { isRestricted: true, allowedDomains: ["@dominio.com"] }));

// Sem acesso
await t("estranho NÃO lê culturas", false, () => getDocs(collection(S, "crops")));
await t("estranho lê só o próprio cadastro (inexistente)", true, () => getDoc(doc(S, "authorized_emails", "estranho_gmail.com")));
await t("estranho NÃO lê cadastro de outro", false, () => getDoc(doc(S, "authorized_emails", "lanc_x.com")));
await t("sem login NÃO lê nada", false, () => getDocs(collection(N, "harvests")));

console.log(`\n${pass} ok, ${fail} falhas`);
await env.cleanup();
process.exit(fail ? 1 : 0);
