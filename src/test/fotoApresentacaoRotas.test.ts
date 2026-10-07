import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';



















const PUBLICA = resolve(__dirname, '../../backend/routes/publicApresentacao.js');
const KIDS = resolve(__dirname, '../../backend/routes/totemKids.js');

function semComentarios(js: string): string {
  return js
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const publica = semComentarios(readFileSync(PUBLICA, 'utf8'));
const kids = semComentarios(readFileSync(KIDS, 'utf8'));

const FORM = resolve(__dirname, '../../src/pages/public/ApresentacaoCriancas.tsx');
const form = semComentarios(readFileSync(FORM, 'utf8'));

describe('porta pública · o CPF vai com o nome do DONO dele', () => {


  it('o funil de identidade recebe o nome do dono do CPF, não o da mãe por padrão', () => {
    expect(publica).toContain('const nomeResp = nomeDoDonoDoCpf(donoCpf, nomePaiT, nomeMaeT);');
    expect(publica).not.toContain('const nomeResp = nomeMaeT || nomePaiT;');
  });

  it('o dono é derivado pela régua, não escrito à mão na rota', () => {
    expect(publica).toContain('const donoCpf = donoDoCpf({');
    expect(publica).toContain('const cpfsDosPais = distribuirCpfs({ dono: donoCpf, cpf: cpfDig, cpfOutro: cpfOutroDig });');
  });

  it('as colunas novas só são mencionadas quando têm valor (lei do 42703)', () => {
    expect(publica).toContain('...(cpfsDosPais.cpf_pai ? { cpf_pai: cpfsDosPais.cpf_pai } : {}),');
    expect(publica).toContain('...(cpfsDosPais.cpf_mae ? { cpf_mae: cpfsDosPais.cpf_mae } : {}),');
  });



  it('sem migration, derruba a coluna e insere assim mesmo', () => {
    expect(publica).toContain("const OPCIONAIS_INSC = ['foto_storage_path', 'foto_enviada_em', 'cpf_pai', 'cpf_mae'];");
    expect(publica).toContain('if (!faltando || !(faltando in linhaAtual)) break;');
  });


  it('o CPF do outro responsável não é obrigatório no servidor', () => {
    expect(publica).toContain('const cpfOutroDig = cpf_outro ? normalizarCpf(cpf_outro) : null;');
    expect(publica).not.toContain("error: 'Informe um CPF válido do outro responsável.'");
  });
});

describe('formulário público · um responsável só AVISA, não bloqueia', () => {
  it('o aviso dispara quando só um dos dois foi preenchido', () => {
    expect(form).toContain('if (temPai !== temMae && !umRespOkRef.current) {');
    expect(form).toContain('setConfirmarUmResp(true);');
  });



  it('o "já confirmei" vive num ref, não em estado', () => {
    expect(form).toContain('const umRespOkRef = useRef(false);');
    expect(form).toContain('umRespOkRef.current = true;');
  });



  it('o servidor continua aceitando um responsável só', () => {
    expect(publica).toContain("if (!nomePaiT && !nomeMaeT) return res.status(400)");
    expect(publica).not.toContain('um_responsavel_confirmado');
  });
});

describe('porta pública · o caminho da foto é validado antes de virar coluna', () => {
  it('o normalizador da lista passa `foto_path` pela régua', () => {
    expect(publica).toContain('caminhoFotoValido(c && c.foto_path) ? c.foto_path : null');
  });


  it('`foto_path` do cliente nunca é usado sem passar pela régua', () => {
    const usos = publica.split('c.foto_path').length - 1;
    const guardados = publica.split('caminhoFotoValido(c && c.foto_path) ? c.foto_path : null').length - 1;

    expect(usos).toBe(guardados * 2);
    expect(guardados).toBe(1);
  });

  it('a coluna só é MENCIONADA no INSERT quando há foto (lei do 42703)', () => {
    expect(publica).toContain('...(c.fotoPath ? { foto_storage_path: c.fotoPath');
  });







  it('sem a migration, derruba a coluna e insere em vez de perder a inscrição', () => {
    expect(publica).toContain("error.code === '42703'");
    expect(publica).toContain('delete linhaAtual[faltando];');
    expect(publica).toContain('({ data, error } = await inserir(linhaAtual));');
  });

  it('sobe pro bucket PRIVADO, nunca pra um público', () => {
    expect(publica).toContain("from('kids-documentos')");
    expect(publica).not.toContain("from('fotos-membros')");
    expect(publica).not.toContain('getPublicUrl');
  });


  it('recebe MULTIPART, não dataURL', () => {
    expect(publica).toContain("uploadFoto.single('foto')");
    expect(publica).not.toContain('data:image');
  });
});

describe('ficha do Kids · a foto é privada e as rotas têm gate', () => {
  it('upload e remoção passam por authorizeModule', () => {
    expect(kids).toContain("router.post('/apresentacoes/:id/foto', authorizeModule('kids', 2)");
    expect(kids).toContain("router.delete('/apresentacoes/:id/foto', authorizeModule('kids', 3)");
  });

  it('o cliente recebe URL ASSINADA, nunca o caminho cru nem URL pública', () => {
    expect(kids).toContain('createSignedUrl(insc.foto_storage_path, 60 * 30');
    expect(kids).toContain('foto_url: fotoUrl');
    expect(kids).not.toContain("getPublicUrl(insc.foto_storage_path");
  });



  it('a troca gera caminho novo em vez de sobrescrever', () => {
    expect(kids).toContain('upload(caminho, req.file.buffer, { contentType: req.file.mimetype, upsert: false })');
  });

  it('a lista tolera a coluna ausente (migration não aplicada)', () => {
    expect(kids).toContain("const OPCIONAIS = ['horario_culto', 'presente_em', 'foto_storage_path'];");
  });



  it('a lista devolve booleano, não o caminho do arquivo', () => {
    expect(kids).toContain('tem_foto: Boolean(foto_storage_path)');
    expect(kids).toContain('const linhas = (data || []).map(({ foto_storage_path, ...r }) => ({');
  });

  it('sem migration devolve 409 dizendo o motivo, nunca 500 genérico', () => {
    expect(kids).toContain('20260916140000');
    expect(kids.split("status(409)").length - 1).toBeGreaterThanOrEqual(2);
  });
});
