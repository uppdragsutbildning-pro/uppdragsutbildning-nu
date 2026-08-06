// University partner logos
import sseLogoImg       from '../../imports/Stockholm_School_Of_Economics_Logo.svg.png';
import kiLogoImg        from '../../imports/ki_logo_pos.png';
import lundLogoImg      from '../../imports/lund-university-logo.png';
import uppsalaLogoImg   from '../../imports/Uppsala_U_logo.png';
import linkopingLogoImg from '../../imports/Linkoping_university_logo15.png';
import luleaLogoImg     from '../../imports/Lulea_tekniska_universitet_Logo.svg.png';
import kthLogoImg       from '../../imports/KTH.png';

/** Maps provider name → imported logo URL. Keyed by name (not ID) since provider
 *  IDs are database-generated UUIDs that differ between staging and production. */
export const providerLogos: Record<string, string> = {
  'Handelshögskolan i Stockholm': sseLogoImg,
  'Karolinska Institutet': kiLogoImg,
  'Lunds Universitet': lundLogoImg,
  'Uppsala Universitet': uppsalaLogoImg,
  'Linköpings Universitet': linkopingLogoImg,
  'Luleå tekniska universitet': luleaLogoImg,
  'KTH Kungliga Tekniska Högskolan': kthLogoImg,
};

export interface UniversityPartner {
  id: string;
  name: string;
  shortName: string;
  logo: string;
}

export const universityPartners: UniversityPartner[] = [
  { id: '1', name: 'Handelshögskolan i Stockholm', shortName: 'SSE', logo: sseLogoImg },
  { id: '2', name: 'Karolinska Institutet',         shortName: 'KI',  logo: kiLogoImg },
  { id: '3', name: 'Lunds Universitet',             shortName: 'LU',  logo: lundLogoImg },
  { id: '4', name: 'Uppsala Universitet',           shortName: 'UU',  logo: uppsalaLogoImg },
  { id: '5', name: 'Linköpings Universitet',        shortName: 'LiU', logo: linkopingLogoImg },
  { id: '7', name: 'KTH Kungliga Tekniska Högskolan', shortName: 'KTH', logo: kthLogoImg },
];