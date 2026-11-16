import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../../js/csv.js';

test('plain cells pass through; null becomes empty', () => {
  assert.equal(csvCell('abc'), 'abc');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(42), '42');
});

test('quotes cells with commas, quotes and newlines', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('x\ny'), '"x\ny"');
});

test('formula-looking strings get a quote prefix', () => {
  for (const s of ['=SUM(A1)', '+1', '-1', '@cmd']) assert.equal(csvCell(s), `'${s}`);
  assert.equal(csvCell('=1,2'), '"\'=1,2"');
});

test('toCsv joins rows with CRLF', () => {
  assert.equal(toCsv([['a', 'b'], ['1', '=x']]), "a,b\r\n1,'=x\r\n");
});
