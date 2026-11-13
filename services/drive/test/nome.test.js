import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomePasta, rua, anoMes } from '../src/nome.js';

const base = { sigla: 'SP', municipio: 'São Paulo', zona: 'leste', bairro: 'Vila Jacuí', logradouro: 'Avenida São Miguel', codigo: 'A001', criado_em: '2026-11-12T15:00:00Z' };

test('o exemplo do Moises', () => {
  assert.equal(nomePasta(base), 'SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel');
});

test('sem zona, sem bairro e sem rua: NA', () => {
  assert.equal(nomePasta({ ...base, zona: null, bairro: null, logradouro: '' }), 'SP_NA_NA_26 11_A001_NA');
});

test('cidade sem sigla: o nome inteiro', () => {
  assert.equal(nomePasta({ ...base, sigla: null, municipio: 'Santo André', zona: 'sudeste' }), 'Santo André_ZSE_VILA JACUÍ_26 11_A001_Av. São Miguel');
});

test('tipos de rua', () => {
  assert.equal(rua('Rua Augusta'), 'Rua Augusta');
  assert.equal(rua('R. Augusta'), 'Rua Augusta');
  assert.equal(rua('Av. Paulista'), 'Av. Paulista');
  assert.equal(rua('Alameda Santos'), 'Al. Santos');
  assert.equal(rua('Travessa do Ouvidor'), 'Tv. do Ouvidor');
  assert.equal(rua('Praça da Sé'), 'Pç. da Sé');
  assert.equal(rua('Estrada do M\'Boi Mirim'), 'Estr. do M\'Boi Mirim');
  assert.equal(rua('Avenidas Unidas'), 'Avenidas Unidas');
});

test('o _ só separa as partes', () => {
  assert.equal(nomePasta({ ...base, bairro: 'Jd_Ângela' }).split('_')[2], 'JD-ÂNGELA');
});

test('mês do cadastro no horário de São Paulo', () => {
  assert.equal(anoMes('2026-12-01T02:00:00Z'), '26 11');
  assert.equal(anoMes('2026-12-01T12:00:00Z'), '26 12');
});

test('segundo terreno da mesma rua: " 2" no fim da rua', () => {
  assert.equal(nomePasta({ ...base, codigo: 'A002', numero_rua: 2 }), 'SP_ZL_VILA JACUÍ_26 11_A002_Av. São Miguel 2');
  assert.equal(nomePasta({ ...base, numero_rua: null }), 'SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel');
  assert.equal(nomePasta({ ...base, logradouro: '', numero_rua: 2 }), 'SP_ZL_VILA JACUÍ_26 11_A001_NA');
});
