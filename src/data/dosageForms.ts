export interface DosageFormInfo {
  id: string;
  nameAr: string;
  nameEn: string;
  abbreviation: string;
  category: 'oral' | 'topical' | 'injectable' | 'respiratory' | 'rectal_vaginal' | 'ophthalmic_otic' | 'medical_supply';
}

export const GLOBAL_DOSAGE_FORMS: DosageFormInfo[] = [
  // فموي - Oral Solids & Liquids
  { id: 'tablet', nameAr: 'حب / أقراص', nameEn: 'Tablet', abbreviation: 'Tab', category: 'oral' },
  { id: 'capsule', nameAr: 'كبسول', nameEn: 'Capsule', abbreviation: 'Cap', category: 'oral' },
  { id: 'syrup', nameAr: 'شراب', nameEn: 'Syrup', abbreviation: 'Syr', category: 'oral' },
  { id: 'suspension', nameAr: 'معلق', nameEn: 'Suspension', abbreviation: 'Susp', category: 'oral' },
  { id: 'sachet', nameAr: 'فوار / أكياس', nameEn: 'Sachet / Granules', abbreviation: 'Sach', category: 'oral' },
  { id: 'effervescent', nameAr: 'أقراص فوارة', nameEn: 'Effervescent Tablet', abbreviation: 'Eff. Tab', category: 'oral' },
  { id: 'sublingual', nameAr: 'حب تحت اللسان', nameEn: 'Sublingual Tablet', abbreviation: 'Sub. Tab', category: 'oral' },
  { id: 'chewable', nameAr: 'حب للمضغ', nameEn: 'Chewable Tablet', abbreviation: 'Chew. Tab', category: 'oral' },
  { id: 'lozenge', nameAr: 'أقراص مص للحلق', nameEn: 'Lozenge', abbreviation: 'Loz', category: 'oral' },
  { id: 'oral_drops', nameAr: 'قطرات فموية', nameEn: 'Oral Drops', abbreviation: 'Oral Gtt', category: 'oral' },

  // موضعي وجلدي - Topical & Dermatological
  { id: 'cream', nameAr: 'كريم', nameEn: 'Cream', abbreviation: 'Crm', category: 'topical' },
  { id: 'ointment', nameAr: 'مرهم', nameEn: 'Ointment', abbreviation: 'Oint', category: 'topical' },
  { id: 'gel', nameAr: 'جل', nameEn: 'Gel', abbreviation: 'Gel', category: 'topical' },
  { id: 'lotion', nameAr: 'لوشن', nameEn: 'Lotion', abbreviation: 'Lot', category: 'topical' },
  { id: 'serum', nameAr: 'سيرم تجميلي / موضعي', nameEn: 'Serum', abbreviation: 'Serum', category: 'topical' },
  { id: 'patch', nameAr: 'لصقة جلدية', nameEn: 'Transdermal Patch', abbreviation: 'Patch', category: 'topical' },
  { id: 'foam', nameAr: 'رغوة جلدية', nameEn: 'Topical Foam', abbreviation: 'Foam', category: 'topical' },
  { id: 'soap', nameAr: 'صابون / شامبو طبي', nameEn: 'Medicated Soap/Shampoo', abbreviation: 'Soap', category: 'topical' },

  // حقن ومحاليل وريدية - Injectables & Infusions
  { id: 'ampoule', nameAr: 'أمبول حقن', nameEn: 'Ampoule', abbreviation: 'Amp', category: 'injectable' },
  { id: 'vial', nameEn: 'Vial', nameAr: 'فيال / حقنة مجففة', abbreviation: 'Vial', category: 'injectable' },
  { id: 'iv_infusion', nameAr: 'سيرم / محلول وريدي', nameEn: 'IV Infusion / Solution', abbreviation: 'IV Sol', category: 'injectable' },
  { id: 'pen_injector', nameAr: 'قلم حقن جاهز', nameEn: 'Pre-filled Pen / Syringe', abbreviation: 'Pen', category: 'injectable' },

  // تنفسي وبخاخات - Respiratory & Sprays
  { id: 'spray', nameAr: 'بخاخ / رذاذ', nameEn: 'Spray', abbreviation: 'Spray', category: 'respiratory' },
  { id: 'inhaler', nameAr: 'بخاخ استنشاق (MDI)', nameEn: 'Inhaler', abbreviation: 'Inh', category: 'respiratory' },
  { id: 'nasal_spray', nameAr: 'بخاخ أنفي', nameEn: 'Nasal Spray', abbreviation: 'Nas. Spray', category: 'respiratory' },
  { id: 'nebules', nameAr: 'محلول جهاز التبخير', nameEn: 'Nebulizer Solution', abbreviation: 'Neb', category: 'respiratory' },

  // عيني وأذني - Ophthalmic & Otic
  { id: 'eye_drops', nameAr: 'قطرة عين', nameEn: 'Eye Drops', abbreviation: 'Eye Gtt', category: 'ophthalmic_otic' },
  { id: 'ear_drops', nameAr: 'قطرة أذن', nameEn: 'Ear Drops', abbreviation: 'Ear Gtt', category: 'ophthalmic_otic' },
  { id: 'eye_ointment', nameAr: 'مرهم عيني', nameEn: 'Eye Ointment', abbreviation: 'Eye Oint', category: 'ophthalmic_otic' },

  // شرجي ومهبلي - Rectal & Vaginal
  { id: 'suppository', nameAr: 'تحاميل شرجية', nameEn: 'Suppository', abbreviation: 'Supp', category: 'rectal_vaginal' },
  { id: 'vaginal_ovules', nameAr: 'تحاميل / بويضات مهبلية', nameEn: 'Vaginal Suppository/Pessary', abbreviation: 'Vag. Supp', category: 'rectal_vaginal' },
  { id: 'enema', nameAr: 'حقنة شرجية', nameEn: 'Enema', abbreviation: 'Enema', category: 'rectal_vaginal' },

  // مستلزمات طبية وقطع - Medical Supplies & Pieces
  { id: 'piece', nameAr: 'قطعة / مستلزم طبي', nameEn: 'Piece / Medical Device', abbreviation: 'Piece', category: 'medical_supply' },
  { id: 'wash', nameAr: 'غسول / مضمضة', nameEn: 'Mouthwash / Wash', abbreviation: 'Wash', category: 'topical' },
  { id: 'powder', nameAr: 'بودرة طبية', nameEn: 'Medical Powder', abbreviation: 'Pwd', category: 'oral' },
];

export function getDosageFormLabel(form: string): string {
  if (!form) return '';
  const clean = form.toLowerCase().trim();
  const matched = GLOBAL_DOSAGE_FORMS.find(
    f => f.id === clean || 
         f.nameAr.toLowerCase().includes(clean) || 
         f.nameEn.toLowerCase().includes(clean) ||
         f.abbreviation.toLowerCase() === clean
  );
  if (matched) {
    return `${matched.nameAr} (${matched.nameEn})`;
  }
  return form;
}
