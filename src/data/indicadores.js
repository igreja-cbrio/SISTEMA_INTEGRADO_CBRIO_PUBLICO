











export const CATEGORIAS = ['Ministerial', 'Geracional', 'Institucional', 'Criativo', 'Operacoes'];

export const AREAS = [
  { id: 'AMI', nome: 'AMI', categoria: 'Geracional' },
  { id: 'CBA', nome: 'CBA', categoria: 'Ministerial' },
  { id: 'CBKids', nome: 'CBKids', categoria: 'Geracional' },
  { id: 'Cuidados', nome: 'Cuidados', categoria: 'Ministerial' },
  { id: 'Grupos', nome: 'Grupos', categoria: 'Ministerial' },
  { id: 'Integracao', nome: 'Integração', categoria: 'Ministerial' },
  { id: 'Voluntariado', nome: 'Voluntariado', categoria: 'Ministerial' },
  { id: 'NEXT', nome: 'NEXT', categoria: 'Ministerial' },
  { id: 'Generosidade', nome: 'Generosidade', categoria: 'Ministerial' },
  { id: 'Jornada', nome: 'Jornada (cross-cutting)', categoria: 'Institucional' },
  { id: 'Igreja', nome: 'Igreja (institucional)', categoria: 'Institucional' },

  { id: 'Financeiro',     nome: 'Financeiro',     categoria: 'Operacoes' },
  { id: 'RH',             nome: 'RH',             categoria: 'Operacoes' },
  { id: 'Infraestrutura', nome: 'Infraestrutura', categoria: 'Operacoes' },
];

export const CATEGORIA_AREAS = {
  Ministerial: ['CBA', 'Cuidados', 'Grupos', 'Integracao', 'Voluntariado', 'NEXT', 'Generosidade'],
  Geracional: ['AMI', 'CBKids'],
  Institucional: ['Jornada', 'Igreja'],
  Criativo: [],
  Operacoes: ['Financeiro', 'RH', 'Infraestrutura'],
};

export const getAreasForCategoria = (cat) => CATEGORIA_AREAS[cat] || [];
export const getAreaNome = (id) => AREAS.find(a => a.id === id)?.nome || id;
