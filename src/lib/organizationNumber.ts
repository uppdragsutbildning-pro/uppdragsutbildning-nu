// Svenskt organisationsnummer: 10 siffror, skrivs NNNNNN-NNNN, sista siffran är en Luhn-kontrollsiffra.
// Returnerar det normaliserade numret, eller null om det inte är giltigt.
export function normalizeOrganizationNumber(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(digits)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(digits[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  if (sum % 10 !== 0) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export const ORGANIZATION_NUMBER_ERROR =
  'Ange ett giltigt organisationsnummer med 10 siffror, till exempel 556000-0000.';
