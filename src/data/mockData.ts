import type { EmergencyCase, ReliefResource } from '@/types';

/**
 * Demo/mock data for development.
 * Clearly labelled — not production data.
 */

export const initialMockCases: EmergencyCase[] = [
  {
    id: 'KC-2026-1048',
    urgency: 'critical',
    category: 'medical',
    status: 'en_route',
    location: {
      name: 'Plot B-42, Street 9, Gulshan-e-Iqbal Block 4, Karachi',
      coordinates: { lat: 24.9204, lng: 67.0934 },
      isApproximate: false,
      addressDetail: 'Near Disco Bakery and Al-Madina Masjid',
      city: 'Karachi',
    },
    requester: {
      name: 'Ahmed Tariq',
      phone: '0300-8241992',
      alternatePhone: '0321-9988221',
    },
    rawMessage:
      'My elderly mother (68 yrs) collapsed suddenly and is unresponsive. Struggling to breathe with rapid shallow pulse. Needs ALS oxygen ambulance immediately.',
    timestamp: 'Just now (4 mins ago)',
    source: 'web',
    aiAnalysis: {
      summary:
        '68yo female unresponsive post-collapse with acute respiratory distress. Immediate Advanced Life Support (ALS) cardiac/oxygen ambulance required.',
      summaryUr:
        '68 سالہ خاتون بے ہوش، سانس میں شدید دشواری۔ فوری آکسیجن والی ایڈوانسڈ لائف سپورٹ ایمبولینس درکار ہے۔',
      reasoning:
        'Unconsciousness coupled with shallow breathing indicates potential myocardial infarction or stroke. Critical Grade-1 triage dispatch triggered.',
      keyNeeds: [
        'ALS Ambulance',
        'High-flow Oxygen',
        'Defibrillator Unit',
        'Nearest Cardiac ER (NICVD/Patel)',
      ],
      peopleCount: 1,
      specialNeeds: 'Stretcher required (2nd floor apartment), O-negative blood standby',
      detectedLanguage: 'English / Urdu mix',
      confidence: 0.98,
      missingInfo: [],
      suggestedFollowUp: 'Are there any known cardiac or diabetic pre-conditions?',
    },
    assignedResource: {
      id: 'AMB-1122-04',
      name: 'Rescue 1122 Unit 4 (ALS)',
      type: 'ALS Cardiac Ambulance',
      plateNumber: 'KHI-GL-8910',
      responderName: 'Muhammad Rizwan (Senior EMT)',
      responderPhone: '0333-5121122',
      etaMinutes: 4,
      distanceKm: 1.8,
      currentCoords: { lat: 24.9125, lng: 67.085 },
    },
    timeline: [
      { step: 'submitted', label: 'Emergency Submitted', labelUr: 'درخواست جمع ہو گئی', time: '14:22', completed: true },
      { step: 'ai_reviewed', label: 'AI Triage: Critical Grade 1', labelUr: 'AI تجزیہ: شدید ایمرجنسی', time: '14:22', completed: true },
      { step: 'operator_reviewing', label: 'Operator Approved Dispatch', labelUr: 'آپریٹر نے تصدیق کی', time: '14:23', completed: true },
      { step: 'resource_assigned', label: 'Rescue 1122 Unit 4 Assigned', labelUr: 'ریسکیو یونٹ 4 تفویض', time: '14:23', completed: true },
      { step: 'en_route', label: 'En Route (Sirens Active)', labelUr: 'راستے میں ہے (لائیو GPS)', time: '14:24', completed: true, current: true, note: '4 mins away on University Road' },
      { step: 'arrived', label: 'Arrived at Scene', labelUr: 'موقع پر پہنچ گئی', time: '--:--', completed: false },
      { step: 'completed', label: 'Hospital Handover', labelUr: 'ہسپتال منتقلی مکمل', time: '--:--', completed: false },
    ],
    operatorNotes: ['Coordinated Patel Hospital ER for direct bed admission.', 'Caller confirmed gate code 409.'],
  },
  {
    id: 'KC-2026-1049',
    urgency: 'critical',
    category: 'rescue',
    status: 'operator_reviewing',
    location: {
      name: 'Near Super Highway Toll Plaza, Old Flood Nullah, Karachi',
      isApproximate: true,
      addressDetail: 'Approx. 500m west of toll plaza near truck depot, GPS signal lost',
      city: 'Karachi',
    },
    requester: {
      name: 'Kamran Ali',
      phone: '0345-2211900',
    },
    rawMessage:
      'Pani ghar mein daakhil ho chuka hai 4 fit tak, 5 log chhat pe phansay huay hain 2 bachay hain. Mobile battery 5 percent hai.',
    timestamp: '8 mins ago',
    source: 'voice_call',
    aiAnalysis: {
      summary:
        'Urban flash flood trapped 5 people (including 2 children) on rooftop with rapidly rising water (4ft depth). Inflatable rescue boat needed.',
      summaryUr:
        'سیلابی پانی گھر میں داخل، چھت پر 5 افراد (بشمول 2 بچے) محصور۔ ریسکیو کشتی اور لائف جیکٹس درکار۔',
      reasoning:
        'Rooftop entrapment with imminent phone battery depletion and rising flood level. Life-threatening.',
      keyNeeds: ['Inflatable Rescue Boat', '5 Life Jackets', 'Waterproof Searchlights', 'Evacuation Shelter'],
      peopleCount: 5,
      specialNeeds: '2 toddlers (ages 2 and 4)',
      detectedLanguage: 'Roman Urdu',
      confidence: 0.94,
      missingInfo: ['Exact coordinate pin (Caller phone dead, relying on cell tower sector)'],
    },
    voiceTranscript: {
      fullText:
        'Hello 1122? Bhai please jaldi ayein yahan toll plaza ke peeche nullah overflow ho gaya hai. Pani 4 foot chadh gaya hai hum log chat pe hain 2 chote bachay hain ro rahay hain bohot sardi hai. Battery khatam ho rahi hai...',
      audioLength: '0:38',
      durationSeconds: 38,
      isDroppedCall: true,
      callTime: '14:18',
    },
    timeline: [
      { step: 'submitted', label: 'Voice Call Received', labelUr: 'فون کال موصول', time: '14:18', completed: true },
      { step: 'ai_reviewed', label: 'Speech-to-Text & AI Triage', labelUr: 'AI آواز سے تجزیہ', time: '14:18', completed: true },
      { step: 'operator_reviewing', label: 'Operator Routing Boat Unit', labelUr: 'آپریٹر کشتی یونٹ تلاش کر رہا ہے', time: '14:19', completed: true, current: true },
      { step: 'resource_assigned', label: 'Resource Assigned', labelUr: 'وسائل تفویض', time: '--:--', completed: false },
      { step: 'en_route', label: 'En Route', labelUr: 'راستے میں', time: '--:--', completed: false },
      { step: 'arrived', label: 'Arrived', labelUr: 'پہنچ گئے', time: '--:--', completed: false },
      { step: 'completed', label: 'Completed', labelUr: 'مکمل', time: '--:--', completed: false },
    ],
    operatorNotes: ['Cell tower triangulation points to Sector 18-A. Contacted Edhi Marine Boat Unit 2.'],
  },
];

export const mockReliefResources: ReliefResource[] = [
  {
    id: 'AKF-07',
    name: 'Alkhidmat Foundation Ambulance AKF-07 (ALS)',
    nameUr: 'الخدمت ایمبولینس AKF-07',
    type: 'ambulance',
    verified: true,
    availability: 'available',
    phone: '0300-1122070',
    address: 'Nipa Chowrangi Station, Gulshan, Karachi',
    addressUr: 'نیپا چورنگی، گلشن، کراچی',
    distance: '2.1 km away',
    coordinates: { lat: 24.919, lng: 67.098 },
    capacity: 'Advanced Life Support (ALS) • Ahmed Khan (EMT Lead)',
    organization: 'Alkhidmat Disaster Management Cell',
  },
  {
    id: 'AMB-1122-04',
    name: 'Rescue 1122 Unit 4 (ALS Cardiac)',
    nameUr: 'ریسکیو 1122 یونٹ 4 (کارڈیک)',
    type: 'ambulance',
    verified: true,
    availability: 'available',
    phone: '1122',
    address: 'University Road Civic Center Station',
    addressUr: 'یونیورسٹی روڈ سوک سینٹر',
    distance: '1.8 km away',
    coordinates: { lat: 24.8963, lng: 67.0722 },
    capacity: 'High-flow Oxygen & Defibrillator • M. Rizwan (Senior EMT)',
    organization: 'Sindh Emergency Rescue 1122',
  },
  {
    id: 'RES-04',
    name: 'National Institute of Cardiovascular Diseases (NICVD)',
    nameUr: 'قومی ادارہ برائے امراض قلب (این آئی سی وی ڈی)',
    type: 'medical',
    verified: true,
    availability: 'available',
    phone: '021-99201271',
    address: 'Rafiqui Shaheed Road, Karachi Cantt',
    addressUr: 'رفیقی شہید روڈ، کراچی کینٹ',
    distance: '4.8 km away',
    coordinates: { lat: 24.8519, lng: 67.0375 },
    capacity: '24/7 Emergency Cardiac ER • 14 Ventilators Available',
    organization: 'Public Tertiary Care Hospital',
  },
  {
    id: 'RES-05',
    name: 'Emergency Flood Relief Shelter #4',
    nameUr: 'ہنگامی ریلیف کیمپ و پناہ گاہ نمبر 4',
    type: 'shelter',
    verified: true,
    availability: 'limited',
    phone: '0300-8877665',
    address: 'Gulshan Complex Community Center, Block 7',
    addressUr: 'گلشن کمپلیکس کمیونٹی سینٹر، بلاک 7',
    distance: '2.8 km away',
    coordinates: { lat: 24.9288, lng: 67.1012 },
    capacity: 'Space for 85 Displaced Persons • Hot Meals Serving',
    stock: '120 Blankets, 40 Mattresses',
    organization: 'District Disaster Management Authority (DDMA)',
  },
];

export const mockActiveBrowserCase: EmergencyCase = initialMockCases[0];
