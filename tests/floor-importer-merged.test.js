import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalLouisianaDocumentUrl } from '../src/lib/louisiana-document-url.js';

test('canonical floor document URL', () => {
  assert.equal(
    canonicalLouisianaDocumentUrl(
      'https://www.legis.la.gov/ViewDocument.aspx?d=1478997'
    ),
    'https://legis.la.gov/Legis/ViewDocument.aspx?d=1478997'
  );
});
