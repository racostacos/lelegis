import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalLouisianaDocumentUrl } from '../src/lib/louisiana-document-url.js';

test('canonicalizes broken www floor vote URL', () => {
  assert.equal(
    canonicalLouisianaDocumentUrl('https://www.legis.la.gov/ViewDocument.aspx?d=1478997'),
    'https://legis.la.gov/Legis/ViewDocument.aspx?d=1478997'
  );
});

test('keeps canonical floor vote URL canonical', () => {
  assert.equal(
    canonicalLouisianaDocumentUrl('https://legis.la.gov/Legis/ViewDocument.aspx?d=1463311'),
    'https://legis.la.gov/Legis/ViewDocument.aspx?d=1463311'
  );
});

test('canonicalizes committee vote URL too', () => {
  assert.equal(
    canonicalLouisianaDocumentUrl('https://www.legis.la.gov/CommitteeVote.aspx?moi=981182'),
    'https://legis.la.gov/Legis/CommitteeVote.aspx?moi=981182'
  );
});
