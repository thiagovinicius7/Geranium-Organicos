# Migração para o banco de dados próprio (Geranium Orgânicos)

Até agora o app usava o banco que o Google AI Studio criou automaticamente
(projeto `gen-lang-client-0996248003`), com as regras de segurança abertas:
qualquer pessoa com a configuração do site conseguia ler e apagar os dados.

Esta versão passa a usar **um projeto Firebase seu**, protegido por regras que
só liberam contas Google autorizadas. Siga os passos na ordem.

> ⚠️ Não faça o merge desta versão na `main` antes de preencher o
> `firebase-config.json` (passo 4). Sem ele, o site publicado mostra só a tela
> "Banco de dados não configurado".

---

## 1. Criar o projeto Firebase

1. Acesse <https://console.firebase.google.com/> e clique em **Adicionar projeto**.
2. Nome sugerido: `geranium-organicos`. O Google Analytics pode ficar desligado.
3. O plano gratuito (Spark) é suficiente.

## 2. Ligar o Firestore

1. No menu, **Build → Firestore Database → Criar banco de dados**.
2. Local: `southamerica-east1 (São Paulo)`.
3. Escolha **modo de produção** (as regras certas entram no passo 5).

## 3. Ligar o login Google

1. **Build → Authentication → Começar**.
2. Em **Método de login**, ative **Google** e salve.
3. Em **Configurações → Domínios autorizados**, adicione `thiagovinicius7.github.io`.

## 4. Colar a configuração no app

1. **Configurações do projeto (engrenagem) → Seus apps → ícone `</>` (Web)**.
2. Registre o app (sem Firebase Hosting) e copie o objeto `firebaseConfig`.
3. Preencha o arquivo `firebase-config.json` na raiz do repositório:

```json
{
  "apiKey": "...",
  "authDomain": "geranium-organicos.firebaseapp.com",
  "projectId": "geranium-organicos",
  "storageBucket": "geranium-organicos.firebasestorage.app",
  "messagingSenderId": "...",
  "appId": "..."
}
```

Esses valores não são senhas: eles identificam o projeto e ficam visíveis no
site de qualquer forma. Quem protege os dados são as regras do passo 5.

## 5. Publicar as regras de segurança

1. **Firestore Database → aba Regras**.
2. Apague o conteúdo e cole o arquivo `firestore.rules` deste repositório inteiro.
3. Clique em **Publicar**.

As regras liberam:

| Quem | O que pode fazer |
|---|---|
| Administradores permanentes (`thiagovinicius7@gmail.com`, `rafaelmorenocampos@gmail.com`) | Tudo, inclusive gerenciar quem tem acesso |
| E-mails cadastrados como **admin** em "E-mails Autorizados" | Tudo, inclusive gerenciar quem tem acesso |
| E-mails cadastrados como **usuário**, domínios liberados ou modo aberto | Ler e editar os dados da produção |
| Qualquer outra pessoa | Nada |

Para mudar os administradores permanentes, altere a lista em **dois lugares**:
`isPermanentAdmin()` em `firestore.rules` e `PERMANENT_ADMIN_EMAILS` em
`src/lib/authorizedEmails.ts`.

## 6. Publicar o app

Faça o merge na `main`. O GitHub Actions gera e publica o site sozinho.

## 7. Migrar os dados

1. Entre no app com `thiagovinicius7@gmail.com`.
2. No menu, abra **Migrar Dados** (só aparece para administradores).
3. Clique em **Copiar do banco antigo**. Uma janela de login Google do banco
   antigo vai abrir; entre com a mesma conta.
4. Confira os totais e marque o que deve ir para o banco novo. Já vêm marcados
   **Culturas**, **Configurações** e **E-mails autorizados**. Plantios,
   colheitas, compras e licenças ficam desmarcados e começam do zero, mas você
   pode marcar qualquer um deles.
5. Marque a confirmação e clique em **Gravar no banco novo**.

Se preferir, use **Restaurar de um arquivo de backup** com um `.json` gerado em
*Importar Planilha → Baixar Backup* no app antigo.

O que acontece na gravação:

- Coleções de dados marcadas (por exemplo, Culturas) são apagadas no banco novo
  e substituídas pela cópia. Isso evita duplicar as culturas padrão criadas no
  primeiro login.
- Configurações e e-mails autorizados são somados aos atuais.
- O que ficar desmarcado não é copiado.
- A conta `certificadora@geranium.com.br` não é copiada. O acesso por usuário e
  senha foi removido.

## 8. Fechar o banco antigo

Depois de conferir que tudo chegou ao banco novo:

1. Abra <https://console.firebase.google.com/> e selecione o projeto
   `gen-lang-client-0996248003`.
2. Em **Firestore Database**, escolha o banco `ai-studio-geraniumorgnicos-…`.
3. Na aba **Regras**, troque tudo por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Publique. Enquanto isso não for feito, os dados antigos continuam abertos
   para qualquer pessoa na internet.

Depois disso o botão **Copiar do banco antigo** para de funcionar, o que é o
esperado. Quando não precisar mais dele, apague `firebase-legacy-config.json`,
`src/lib/migration.ts` e `src/components/MigrationPanel.tsx`.

## Acesso da certificadora

O login "Certificadora" com senha fixa foi removido, porque a senha ficava
visível no código do site. Para dar acesso à auditoria, cadastre o e-mail Google
da pessoa em **E-mails Autorizados**, como usuário. Quando a auditoria terminar,
remova o e-mail.
