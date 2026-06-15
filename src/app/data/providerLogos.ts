// University partner logos
import sseLogoImg       from '../../imports/Stockholm_School_Of_Economics_Logo.svg.png';
import kiLogoImg        from '../../imports/ki_logo_pos.png';
import lundLogoImg      from '../../imports/lund-university-logo.png';
import uppsalaLogoImg   from '../../imports/Uppsala_U_logo.png';
import linkopingLogoImg from '../../imports/Linkoping_university_logo15.png';
import luleaLogoImg     from '../../imports/Lulea_tekniska_universitet_Logo.svg.png';
import kthLogoImg       from '../../imports/KTH.png';

/** Maps provider ID → imported logo URL */
export const providerLogos: Record<string, string> = {
  '1': sseLogoImg,
  '2': kiLogoImg,
  '3': lundLogoImg,
  '4': uppsalaLogoImg,
  '5': linkopingLogoImg,
  '6': luleaLogoImg,
  '7': kthLogoImg,
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