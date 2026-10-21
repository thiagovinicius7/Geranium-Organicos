# Acesso e segurança — Geranium Orgânicos

O app usa o projeto Firebase **geranium-organicos**. Quem protege os dados são as
regras do arquivo `firestore.rules`. A interface só esconde os botões; mesmo que
alguém tente pelo navegador, o Firestore recusa o que o perfil não permite.

## Perfis de acesso

| Perfil | O que pode fazer |
|---|---|
| **Administrador** | Tudo, inclusive liberar e remover acessos e mudar perfis. |
| **Editor** | Lança, edita e apaga todos os dados da produção (culturas, compras, plantios, colheitas, licenças, dados do sítio). |
| **Lançamentos** | Vê tudo. Registra plantios, colheitas e compras. Corrige ou apaga **só as próprias colheitas, nas primeiras 12 horas**. Não altera culturas, licenças nem configurações, não finaliza plantios e não apaga plantios nem compras. |

- Os administradores permanentes são `thiagovinicius7@gmail.com` e
  `rafaelmorenocampos@gmail.com`. Para mudar essa lista, altere `isPermanentAdmin()`
  em `firestore.rules` **e** `PERMANENT_ADMIN_EMAILS` em `src/lib/authorizedEmails.ts`.
- Quem entra por um **domínio liberado** ou pelo **modo aberto** recebe perfil Editor.
- Um e-mail cadastrado vale pelo perfil do cadastro, mesmo que o domínio também
  esteja liberado.

Os perfis são definidos em **E-mails Autorizados**: escolha o perfil ao liberar
um e-mail novo ou troque o perfil na lista.

Todo lançamento novo de plantio, colheita ou compra guarda quem lançou e quando
(`criadoPor`, `criadoPorEmail`, `criadoEm`).

## Publicar as regras

Sempre que `firestore.rules` mudar:

1. Abra <https://console.firebase.google.com/project/geranium-organicos/firestore/rules>.
2. Apague o conteúdo, cole o arquivo `firestore.rules` inteiro e clique em **Publicar**.

Sem esse passo, o perfil Lançamentos aparece no app mas o banco continua
aceitando alterações dele.

## Configurar um projeto do zero

Só é preciso se um dia trocar de projeto Firebase.

1. Crie o projeto em <https://console.firebase.google.com/>.
2. **Firestore Database → Criar banco de dados**, local `southamerica-east1`,
   modo de produção.
3. **Authentication → Método de login → Google**; em **Configurações →
   Domínios autorizados**, adicione `thiagovinicius7.github.io`.
4. Em **Configurações do projeto → Seus apps → Web**, copie o `firebaseConfig`
   para o arquivo `firebase-config.json`.
5. Publique as regras (seção acima).

## Backup

O plano gratuito do Firebase não tem backup automático. De vez em quando, use
**Importar Planilha → Baixar Backup** (perfis Administrador e Editor) e guarde o
arquivo `.json`.

## Testar as regras

O arquivo `tests/regras.test.mjs` testa as regras no emulador do Firestore, com
cenários para cada perfil. As instruções para rodar estão no topo do arquivo.
