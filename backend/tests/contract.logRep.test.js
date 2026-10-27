const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { logRepSchema } = require('../src/validation/schemas');

test('Contract test: logRep.fixture.json validates against backend logRepSchema', () => {
  const fixturePath = path.resolve(__dirname, '../../contracts/logRep.fixture.json');
  const content = fs.readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(content);

  const parsed = logRepSchema.safeParse(fixture);
  assert.equal(parsed.success, true, `Schema parse failed: ${JSON.stringify(parsed.error?.errors)}`);
  assert.equal(parsed.data.sessionId, 'sess_1729000000_abc123');
  assert.equal(parsed.data.repNumber, 1);
  assert.equal(parsed.data.tempoScore, 85);
});
