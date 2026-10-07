# Sistema Integrado CBRio — código público

Cópia revisada do código do ERP, com histórico independente. O repositório operacional e seu histórico permanecem privados. Esta publicação não contém o banco de dados, cadastros, anexos, exportações ou credenciais de produção.

## Desenvolvimento e validação

Requisitos: Node.js 22 e npm. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. Para desenvolvimento, configure os exemplos de ambiente com serviços de teste e execute `npm run dev`. O backend Express fica em `backend/`.

Os testes usam fixtures sintéticas. Alguns arquivos SQL foram mantidos para testes de contrato; eles não constituem um histórico completo nem uma instalação do banco a partir do zero. `src/test/fixtures/schema-publico-contratos.sql` serve somente para inspeção estática e não deve ser aplicado em banco.

## Configuração e operação

As listas de acesso, destinatários e identificadores operacionais são configurados exclusivamente no servidor. Sem configuração, os acessos adicionais são negados e certas operações ficam indisponíveis. Consulte `backend/.env.example`; variáveis `CBRIO_PRIVATE_*` não têm valores públicos.

A senha de operação do totem é validada pelo servidor. Não existe uma senha global fixa distribuída nesta cópia. O PIN configurado localmente no dispositivo continua sujeito às regras da instalação.

Fotos, vídeos, modelos de documentos e documentação institucional privada foram omitidos. As páginas demonstrativas usam uma ilustração neutra; vídeo e modelo de certificado podem ser configurados por URLs de materiais revisados e apropriados para publicação.

O CI público executa testes, tipos e compilação, sem secrets, acesso à produção ou publicação de artefatos. Automações operacionais, crons e deploy de produção não foram transferidos. Configurar um novo ambiente exige revisão das permissões, schema e segredos antes de conectar qualquer serviço.

## Proteção dos dados

Não copie o histórico privado para este repositório. Não adicione cadastros, logs de produção, documentos internos, dumps, arquivos de ambiente, anexos ou credenciais, inclusive em testes, issues, PRs ou artefatos do CI. Novos exemplos devem ser sintéticos. Revise toda alteração antes de publicar.

A disponibilização do código não altera as condições da [licença](LICENSE).
