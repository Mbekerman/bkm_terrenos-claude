import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documento } from '../src/portal.js';

test('a Senha Web aceita CPF ou CNPJ, com ou sem pontuação (documentos fictícios)', () => {
  assert.equal(documento('123.456.789-00'), '12345678900');
  assert.equal(documento('00.000.000/0000-00'), '00000000000000');
  assert.equal(documento('00000000000000'), '00000000000000');
  assert.equal(documento(' 12345678900\n'), '12345678900');
});

test('documento fora de 11 ou 14 dígitos é recusado', () => {
  for (const v of [undefined, '', '123', '0'.repeat(10), '0'.repeat(12), '0'.repeat(13), '0'.repeat(15)]) assert.equal(documento(v), null);
});
