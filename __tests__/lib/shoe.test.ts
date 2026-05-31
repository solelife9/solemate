import {parseShoeName, BRANDS} from '../../lib/shoe';

describe('parseShoeName', () => {
  test('empty name → empty brand & model', () => {
    expect(parseShoeName('')).toEqual({brand: '', model: ''});
  });

  test('known single-word brand (case-insensitive prefix)', () => {
    expect(parseShoeName('nike Pegasus 41')).toEqual({brand: 'NIKE', model: 'Pegasus 41'});
  });

  test('known multi-word brand wins over first-space split', () => {
    expect(parseShoeName('New Balance 1080v13')).toEqual({
      brand: 'NEW BALANCE',
      model: '1080v13',
    });
  });

  test('unknown brand → first token is the brand, uppercased', () => {
    expect(parseShoeName('Topo Phantom')).toEqual({brand: 'TOPO', model: 'Phantom'});
  });

  test('single token with no space → brand only', () => {
    expect(parseShoeName('Cloudmonster')).toEqual({brand: 'CLOUDMONSTER', model: ''});
  });

  test('BRANDS catalog is exported and non-empty', () => {
    expect(BRANDS.length).toBeGreaterThan(0);
    expect(BRANDS).toContain('New Balance');
  });
});
