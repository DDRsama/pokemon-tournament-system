const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeEntrant, patchEntrant } = require('../src/core/entrants');

test('entrant check-in state is normalized and preserved through patches', () => {
  const entrant = normalizeEntrant({
    tournamentId: 'tour-checkin',
    displayName: 'Player A',
    checkedIn: true,
    checkedInAt: 123456,
    checkedInBy: 'admin',
  });

  assert.equal(entrant.checkedIn, true);
  assert.equal(entrant.checkedInAt, 123456);
  assert.equal(entrant.checkedInBy, 'admin');

  const renamed = patchEntrant(entrant, { displayName: 'Player B' });
  assert.equal(renamed.displayName, 'Player B');
  assert.equal(renamed.checkedIn, true);
  assert.equal(renamed.checkedInAt, 123456);

  const unchecked = patchEntrant(renamed, {
    checkedIn: false,
    checkedInAt: null,
    checkedInBy: '',
  });
  assert.equal(unchecked.checkedIn, false);
  assert.equal(unchecked.checkedInAt, null);
  assert.equal(unchecked.checkedInBy, '');
});
