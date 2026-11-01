// Svenskt organisationsnummer: 10 siffror, skrivs NNNNNN-NNNN, sista siffran är en Luhn-kontrollsiffra.
// Juridiska personer har minst 20 som tredje och fjärde siffra. Lägre värden (01-12) är en månad,
// alltså ett personnummer (enskild firma), som är en personuppgift och inte ska sparas här.

function digitsOf(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{10}$/.test(digits) ? digits : null;
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(digits[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function looksLikePersonalNumber(digits: string): boolean {
  return Number(digits.slice(2, 4)) < 20;
}

// Returnerar det normaliserade numret, eller null om det inte är ett giltigt organisationsnummer.
export function normalizeOrganizationNumber(input: string): string | null {
  const digits = digitsOf(input);
  if (!digits || !passesLuhn(digits) || looksLikePersonalNumber(digits)) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export const ORGANIZATION_NUMBER_ERROR =
  'Ange ett giltigt organisationsnummer med 10 siffror, till exempel 556000-0000.';

export const PERSONAL_NUMBER_ERROR =
  'Det här ser ut som ett personnummer. Ange organisationens organisationsnummer, inte ett personnummer.';

// Felmeddelande att visa för ett nummer som inte godkänns (null om numret är giltigt).
export function organizationNumberError(input: string): string | null {
  if (normalizeOrganizationNumber(input)) return null;
  const digits = digitsOf(input);
  if (digits && passesLuhn(digits) && looksLikePersonalNumber(digits)) return PERSONAL_NUMBER_ERROR;
  return ORGANIZATION_NUMBER_ERROR;
}
