
import { describe, it, expect } from "vitest";
import { capacidadeDoCulto, capacidadeSomada, CAPACIDADE_TEMPLO, CAPACIDADE_BRIDGE } from "../../backend/utils/capacidadeCulto.js";

describe("capacidade do espaço · a fonte é o BANCO", () => {
  it("o Bridge usa os 100 lugares do Espaço CBRio", () => {
    expect(capacidadeDoCulto({ name: "Bridge", capacidade_lugares: 100 })).toBe(100);
  });

  it("culto sem capacidade declarada usa o templo", () => {
    expect(capacidadeDoCulto({ name: "Domingo 09:30", capacidade_lugares: null })).toBe(CAPACIDADE_TEMPLO);
  });

  it("⚠️⚠️ RENOMEAR o tipo NÃO muda mais a capacidade", () => {



    expect(capacidadeDoCulto({ name: "Encontro de Jovens", capacidade_lugares: 100 })).toBe(100);
  });

  it("⚠️⚠️ e o contrário também: nome com 'bridge' NÃO impõe 100 quando o tipo declarou outra coisa", () => {

    expect(capacidadeDoCulto({ name: "Bridge", capacidade_lugares: 1050 })).toBe(1050);
    expect(capacidadeDoCulto({ name: "Bridge", capacidade_lugares: null })).toBe(CAPACIDADE_TEMPLO);
  });

  it("⚠️ coluna NÃO CARREGADA cai no regex antigo (rede pra bundle velho)", () => {


    expect(capacidadeDoCulto({ name: "Bridge" })).toBe(CAPACIDADE_BRIDGE);
    expect(capacidadeDoCulto({ service_type_name: "Bridge" })).toBe(CAPACIDADE_BRIDGE);
    expect(capacidadeDoCulto({ name: "Domingo 09:30" })).toBe(CAPACIDADE_TEMPLO);
  });

  it("valor inválido não vira capacidade", () => {

    expect(capacidadeDoCulto({ name: "X", capacidade_lugares: 0 })).toBe(CAPACIDADE_TEMPLO);
    expect(capacidadeDoCulto({ name: "X", capacidade_lugares: -5 })).toBe(CAPACIDADE_TEMPLO);
    expect(capacidadeDoCulto({ name: "X", capacidade_lugares: "cem" as never })).toBe(CAPACIDADE_TEMPLO);
    expect(capacidadeDoCulto(null as never)).toBe(CAPACIDADE_TEMPLO);
  });

  it("padrão injetável (pra quem não é o templo)", () => {
    expect(capacidadeDoCulto({ name: "X", capacidade_lugares: null }, 250)).toBe(250);
  });

  it("soma dos lugares OFERECIDOS mistura espaços diferentes corretamente", () => {
    const tipos = [
      { name: "Domingo 09:30", capacidade_lugares: null },
      { name: "Domingo 11:30", capacidade_lugares: null },
      { name: "Bridge", capacidade_lugares: 100 },
    ];
    expect(capacidadeSomada(tipos)).toBe(1050 + 1050 + 100);
  });

  it("⚠️ lista vazia devolve 0 — quem divide TEM que tratar", () => {

    expect(capacidadeSomada([])).toBe(0);
    expect(capacidadeSomada(null as never)).toBe(0);
  });
});
